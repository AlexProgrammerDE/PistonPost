import { dash, sentinel } from "@better-auth/infra"
import { passkey } from "@better-auth/passkey"
import type { BetterAuthPlugin } from "better-auth"
import { emailHarmony } from "better-auth-harmony"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal"
import {
  admin,
  bearer,
  captcha,
  emailOTP,
  haveIBeenPwned,
  lastLoginMethod,
  multiSession,
  oauthPopup,
  openAPI,
  twoFactor,
  username,
} from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { Predicate } from "effect"

import type { D1DatabaseClient, SqliteDatabaseClient } from "@/db"
import * as schema from "@/db/schema"
import { isValidUsername } from "@/domain/validation"
import { authenticationMessage, type EmailContent } from "@/email"

import { createAuthRedirectUrl } from "./auth-redirect"
import { findUsernameOwner, syncProfileUsername } from "./profile"

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
  readonly trustedOrigins: readonly string[]
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
    readonly displayUsername?: string | null
  }) => Promise<void>
}

/** Paths that rely on Better Auth defaults or plugin options outside this list stay unprotected. */
const CAPTCHA_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/username",
  "/request-password-reset",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
]
const SEND_EMAIL_CODE_PATH = "/email-otp/send-verification-otp"

/**
 * Sign-in paths that create a session from something other than the password.
 * Better Auth's two-factor hook only covers password and phone sign-in.
 */
const CODE_SIGN_IN_PATHS = new Set(["/sign-in/email-otp", "/email-otp/verify-email"])

function rejectUnmanagedAvatar(): never {
  throw APIError.fromStatus("BAD_REQUEST", {
    message: "Profile images must be uploaded through PistonPost.",
  })
}

function rejectTakenUsername(): never {
  throw APIError.fromStatus("BAD_REQUEST", {
    code: "USERNAME_IS_ALREADY_TAKEN",
    message: "Username is already taken. Please try another.",
  })
}

/**
 * Reuse the two-factor plugin's sign-in challenge for email-code sign-in, so a
 * code sent to the inbox never replaces the second factor.
 */
function challengeCodeSignIn(plugin: ReturnType<typeof twoFactor>): ReturnType<typeof twoFactor> {
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: plugin.hooks.after.map((hook) => ({
        ...hook,
        matcher: (context) => hook.matcher(context) || CODE_SIGN_IN_PATHS.has(context.path ?? ""),
      })),
    },
  }
}

async function sendsEmailCodeToNewAddress(request: Request) {
  if (request.method !== "POST" || !new URL(request.url).pathname.endsWith(SEND_EMAIL_CODE_PATH)) {
    return false
  }
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => undefined)
  const type: unknown =
    typeof body === "object" && body !== null ? Reflect.get(body, "type") : undefined
  // Verification and change-email codes come from screens that render no
  // captcha. They only reach an address that already belongs to an account.
  return type !== "email-verification" && type !== "change-email"
}

/** Require a captcha for sign-in and password reset codes, but not for verification codes. */
function emailCodeCaptcha(verifier: ReturnType<typeof captcha>) {
  return {
    id: "email-code-captcha",
    onRequest: async (request, context) =>
      (await sendsEmailCodeToNewAddress(request))
        ? verifier.onRequest(request, context)
        : undefined,
  } satisfies BetterAuthPlugin
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
    // No cookie cache: bans, revoked sessions, password resets, and role
    // changes must apply on the next request instead of after the cache expires.
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
    hooks: {
      before: createAuthMiddleware(async (context) => {
        // The Better Auth UI change-email card asks for a "change-email" code
        // for the current address, but Better Auth checks the current address
        // against an "email-verification" code. Translate that one request.
        const body: unknown = context.body
        if (
          context.path !== SEND_EMAIL_CODE_PATH ||
          !Predicate.isObject(body) ||
          body["type"] !== "change-email"
        ) {
          return
        }
        const session = await getSessionFromCtx(context)
        const email = body["email"]
        if (
          session &&
          typeof email === "string" &&
          email.toLowerCase() === session.user.email.toLowerCase()
        ) {
          body["type"] = "email-verification"
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (user.image !== undefined && user.image !== null) rejectUnmanagedAvatar()
            if (
              typeof user["username"] === "string" &&
              (await findUsernameOwner(runtime.database, user["username"])) !== undefined
            ) {
              rejectTakenUsername()
            }
          },
          after: async (user) => runtime.initializeProfile?.(user),
        },
        update: {
          before: async (user, context) => {
            if (typeof user["username"] === "string") {
              const targetUserId: unknown =
                context?.path === "/admin/update-user"
                  ? Reflect.get(new Object(context.body), "userId")
                  : context?.context.session?.user.id
              const owner = await findUsernameOwner(runtime.database, user["username"])
              if (owner !== undefined && owner !== targetUserId) rejectTakenUsername()
            }

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
          after: async (user) => {
            if (typeof user["username"] !== "string") return
            await syncProfileUsername(runtime.database, {
              id: user.id,
              username: user["username"],
              displayUsername:
                typeof user["displayUsername"] === "string" ? user["displayUsername"] : null,
            })
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
      bearer(),
      oauthPopup(),
      username({
        minUsernameLength: 1,
        maxUsernameLength: 32,
        usernameValidator: isValidUsername,
        displayUsernameValidator: isValidUsername,
      }),
      emailOTP({
        disableSignUp: true,
        expiresIn: 60 * 5,
        storeOTP: "hashed",
        allowedAttempts: 3,
        overrideDefaultEmailVerification: true,
        changeEmail: { enabled: true, verifyCurrentEmail: true },
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
      challengeCodeSignIn(
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
      ),
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
              endpoints: CAPTCHA_ENDPOINTS,
            }),
            emailCodeCaptcha(
              captcha({
                provider: "cloudflare-turnstile",
                secretKey: runtime.turnstileSecret,
                endpoints: [SEND_EMAIL_CODE_PATH],
              }),
            ),
          ]
        : []),
      tanstackStartCookies(),
    ],
  } satisfies BetterAuthOptions)
}
