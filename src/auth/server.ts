import { dash, sentinel } from "@better-auth/infra"
import { passkey } from "@better-auth/passkey"
import { emailHarmony } from "better-auth-harmony"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal"
import {
  admin,
  captcha,
  emailOTP,
  haveIBeenPwned,
  lastLoginMethod,
  multiSession,
  openAPI,
  twoFactor,
  username,
} from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import type { D1DatabaseClient, SqliteDatabaseClient } from "@/db"
import * as schema from "@/db/schema"
import { authenticationMessage, type EmailContent } from "@/email"

import { createAuthRedirectUrl } from "./auth-redirect"

export type AuthenticationEmail = {
  readonly to: string
  readonly content: EmailContent
  readonly idempotencyKey: string
}

export type AuthRuntime = {
  readonly database: D1DatabaseClient | SqliteDatabaseClient
  readonly baseURL: string
  readonly betterAuthApiKey: string
  readonly secret: string
  readonly trustedOrigins: ReadonlyArray<string>
  readonly turnstileSecret: string
  readonly production: boolean
  readonly infraEnabled?: boolean
  readonly sendEmail: (message: AuthenticationEmail) => Promise<void>
  readonly backgroundTasks?: {
    readonly handler: (promise: Promise<unknown>) => void
  }
  readonly isManagedUserAvatar: (userId: string, image: string) => Promise<boolean>
  readonly audit?: (action: string, userId: string) => Promise<void>
  readonly beforeDeleteUser?: (userId: string) => Promise<void>
  readonly afterDeleteUser?: (userId: string) => Promise<void>
  readonly notifyNewDevice?: (userId: string, sessionId: string) => Promise<void>
  readonly queueSecurityNotification?: (
    userId: string,
    action: "auth.password-reset" | "auth.new-device",
    entityId: string,
  ) => Promise<void>
  readonly initializeProfile?: (user: {
    readonly id: string
    readonly email: string
    readonly name: string
    readonly username?: string | null
  }) => Promise<void>
}

function usernameIsValid(value: string) {
  return value.length >= 1 && value.length <= 32 && /^[A-Za-z0-9._~-]+$/.test(value)
}

function rejectUnmanagedAvatar(): never {
  throw APIError.fromStatus("BAD_REQUEST", {
    message: "Profile images must be uploaded through PistonPost.",
  })
}

export function createAuth(runtime: AuthRuntime) {
  const send = runtime.sendEmail

  return betterAuth({
    appName: "PistonPost",
    baseURL: runtime.baseURL,
    basePath: "/api/auth",
    secret: runtime.secret,
    database: drizzleAdapter(runtime.database, { provider: "sqlite", schema }),
    verification: {
      storeIdentifier: "hashed",
    },
    trustedOrigins: [...runtime.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        await send({
          to: user.email,
          content: authenticationMessage({
            template: "password-reset",
            email: user.email,
            url,
            expirationMinutes: 60,
          }),
          idempotencyKey: `password-reset:${token}`,
        })
      },
      onPasswordReset: async ({ user }) => {
        await runtime.queueSecurityNotification?.(user.id, "auth.password-reset", user.id)
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
          await send({
            to: user.email,
            content: authenticationMessage({
              template: "email-change-approval",
              currentEmail: user.email,
              newEmail,
              url,
              expirationMinutes: 60,
            }),
            idempotencyKey: `email-change-approval:${token}`,
          })
        },
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url, token }) => {
          await send({
            to: user.email,
            content: authenticationMessage({
              template: "account-deletion",
              email: user.email,
              url: createAuthRedirectUrl(runtime.baseURL, url),
              expirationHours: 24,
            }),
            idempotencyKey: `account-deletion:${token}`,
          })
        },
        beforeDelete: async (user) => runtime.beforeDeleteUser?.(user.id),
        afterDelete: async (user) => runtime.afterDeleteUser?.(user.id),
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "jwe",
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      cookiePrefix: "pistonpost",
      database: {
        generateId: "uuid",
        joins: true,
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
      backgroundTasks: runtime.backgroundTasks,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (user.image !== undefined && user.image !== null) rejectUnmanagedAvatar()
          },
          after: async (user) => runtime.initializeProfile?.(user),
        },
        update: {
          before: async (user, context) => {
            if (user.image === undefined || user.image === null) return

            const userId = context?.context.session?.user.id
            if (
              !userId ||
              typeof user.image !== "string" ||
              !(await runtime.isManagedUserAvatar(userId, user.image))
            ) {
              rejectUnmanagedAvatar()
            }
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await runtime.notifyNewDevice?.(session.userId, session.id)
          },
        },
      },
    },
    plugins: [
      username({
        minUsernameLength: 1,
        maxUsernameLength: 32,
        usernameValidator: usernameIsValid,
        displayUsernameValidator: usernameIsValid,
      }),
      emailOTP({
        disableSignUp: true,
        expiresIn: 60 * 5,
        storeOTP: "hashed",
        allowedAttempts: 3,
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await send({
            to: email,
            content: authenticationMessage({
              template: "email-otp",
              purpose: type,
              email,
              code: otp,
              expirationMinutes: 5,
            }),
            idempotencyKey: `email-otp:${email}:${otp}`,
          })
        },
      }),
      twoFactor({
        issuer: "PistonPost",
        otpOptions: {
          period: 3,
          allowedAttempts: 5,
          storeOTP: "hashed",
          sendOTP: async ({ user, otp }) => {
            await send({
              to: user.email,
              content: authenticationMessage({
                template: "two-factor-otp",
                purpose: "two-factor",
                email: user.email,
                code: otp,
                expirationMinutes: 3,
              }),
              idempotencyKey: `two-factor:${user.id}:${otp}`,
            })
          },
        },
      }),
      passkey({ rpID: new URL(runtime.baseURL).hostname, rpName: "PistonPost" }),
      admin(),
      multiSession({ maximumSessions: 10 }),
      lastLoginMethod({
        storeInDatabase: true,
      }),
      haveIBeenPwned({ enabled: runtime.production }),
      emailHarmony(),
      ...(runtime.infraEnabled === false
        ? []
        : [
            dash({
              apiKey: runtime.betterAuthApiKey,
              activityTracking: { enabled: true },
            }),
            sentinel({ apiKey: runtime.betterAuthApiKey }),
          ]),
      openAPI(),
      ...(runtime.production
        ? [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: runtime.turnstileSecret,
            }),
          ]
        : []),
      tanstackStartCookies(),
    ],
  } satisfies BetterAuthOptions)
}
