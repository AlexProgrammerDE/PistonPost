import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { passkey } from "@better-auth/passkey"
import { emailHarmony } from "better-auth-harmony"
import { betterAuth } from "better-auth/minimal"
import {
  admin,
  captcha,
  emailOTP,
  haveIBeenPwned,
  lastLoginMethod,
  magicLink,
  multiSession,
  twoFactor,
  username,
} from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import type { D1DatabaseClient, SqliteDatabaseClient } from "@/db"
import * as schema from "@/db/schema"
import {
  authenticationMessage,
  renderEmail,
  securityNotificationMessage,
  type EmailContent,
} from "@/email"

export type AuthenticationEmail = {
  readonly to: string
  readonly content: EmailContent
  readonly idempotencyKey: string
}

export type AuthRuntime = {
  readonly database: D1DatabaseClient | SqliteDatabaseClient
  readonly baseURL: string
  readonly secret: string
  readonly trustedOrigins: ReadonlyArray<string>
  readonly turnstileSecret: string
  readonly production: boolean
  readonly captchaEnabled?: boolean
  readonly sendEmail: (message: AuthenticationEmail) => Promise<void>
  readonly audit?: (action: string, userId: string) => Promise<void>
  readonly beforeDeleteUser?: (userId: string) => Promise<void>
  readonly afterDeleteUser?: (userId: string) => Promise<void>
  readonly notifyNewDevice?: (userId: string, sessionId: string) => Promise<void>
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

export function turnstileAllowedHostnames(baseURL: string) {
  const hostname = new URL(baseURL).hostname
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? [hostname, "example.com"]
    : [hostname]
}

export function createAuth(runtime: AuthRuntime) {
  const send = runtime.sendEmail

  return betterAuth({
    appName: "PistonPost",
    baseURL: runtime.baseURL,
    basePath: "/api/auth",
    secret: runtime.secret,
    database: drizzleAdapter(runtime.database, { provider: "sqlite", schema }),
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
            url,
            expiresIn: "in one hour",
          }),
          idempotencyKey: `password-reset:${token}`,
        })
      },
      onPasswordReset: async ({ user }) => {
        await runtime.audit?.("auth.password-reset", user.id)
        await send({
          to: user.email,
          content: securityNotificationMessage({ template: "password-changed" }),
          idempotencyKey: `password-changed:${user.id}:${Date.now().toString()}`,
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        await send({
          to: user.email,
          content: authenticationMessage({
            template: "email-verification",
            url,
            expiresIn: "in one hour",
          }),
          idempotencyKey: `email-verification:${token}`,
        })
      },
    },
    user: {
      changeEmail: { enabled: true },
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 60 * 60,
        sendDeleteAccountVerification: async ({ user, url, token }) => {
          await send({
            to: user.email,
            content: authenticationMessage({
              template: "account-deletion",
              url,
              expiresIn: "in one hour",
            }),
            idempotencyKey: `account-deletion:${token}`,
          })
        },
        beforeDelete: async (user) => runtime.beforeDeleteUser?.(user.id),
        afterDelete: async (user) => runtime.afterDeleteUser?.(user.id),
      },
    },
    session: {
      freshAge: 60 * 15,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
        strategy: "jwe",
        refreshCache: false,
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
    },
    advanced: {
      cookiePrefix: "pistonpost",
      useSecureCookies: runtime.production,
      database: { generateId: "uuid" },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => runtime.initializeProfile?.(user),
        },
      },
      session: {
        create: {
          after: async (session) => {
            await runtime.audit?.("auth.session-created", session.userId)
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
      magicLink({
        expiresIn: 60 * 10,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url, token }) => {
          await send({
            to: email,
            content: authenticationMessage({
              template: "magic-link",
              url,
              expiresIn: "in 10 minutes",
            }),
            idempotencyKey: `magic-link:${token}`,
          })
        },
      }),
      emailOTP({
        expiresIn: 60 * 5,
        storeOTP: "hashed",
        allowedAttempts: 3,
        sendVerificationOTP: async ({ email, otp }) => {
          await send({
            to: email,
            content: authenticationMessage({
              template: "email-otp",
              code: otp,
              expiresIn: "in 5 minutes",
            }),
            idempotencyKey: `email-otp:${email}:${otp}`,
          })
        },
      }),
      twoFactor({
        issuer: "PistonPost",
        allowPasswordless: true,
        otpOptions: {
          period: 3,
          allowedAttempts: 5,
          storeOTP: "hashed",
          sendOTP: async ({ user, otp }) => {
            await send({
              to: user.email,
              content: authenticationMessage({
                template: "two-factor-otp",
                code: otp,
                expiresIn: "in 3 minutes",
              }),
              idempotencyKey: `two-factor:${user.id}:${otp}`,
            })
          },
        },
      }),
      passkey({ rpID: new URL(runtime.baseURL).hostname, rpName: "PistonPost" }),
      admin(),
      multiSession({ maximumSessions: 10 }),
      lastLoginMethod(),
      haveIBeenPwned({ enabled: runtime.production }),
      emailHarmony(),
      ...(runtime.captchaEnabled === false
        ? []
        : [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: runtime.turnstileSecret,
              allowedHostnames: turnstileAllowedHostnames(runtime.baseURL),
              endpoints: [
                "/sign-up/email",
                "/sign-in/email",
                "/sign-in/username",
                "/sign-in/magic-link",
                "/email-otp/send-verification-otp",
                "/request-password-reset",
              ],
            }),
          ]),
      tanstackStartCookies(),
    ],
  })
}

export async function renderAuthenticationEmail(message: AuthenticationEmail) {
  return {
    ...message,
    rendered: await renderEmail(message.content),
  }
}
