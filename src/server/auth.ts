import { eq } from "drizzle-orm"
import { Effect } from "effect"

import { createAuth, renderAuthenticationEmail } from "@/auth/server"
import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { createCloudflareEmailTransport, renderEmail, securityNotificationMessage } from "@/email"

import type { AppRequestContext } from "../server"
import { isManagedUserAvatar } from "./avatar-policy"
import { requireEmailBinding } from "./email-binding"
import { notificationEnabled } from "./notification-policy"

async function readSecret(secret: string | SecretsStoreSecret) {
  return typeof secret === "string" ? secret : secret.get()
}

export async function createRequestAuth(context: AppRequestContext) {
  const { env, runtime } = context
  const baseURL = runtime.config.PUBLIC_APP_URL.toString()
  const [secret, turnstileSecret] = await Promise.all([
    readSecret(env.BETTER_AUTH_SECRET),
    readSecret(env.TURNSTILE_SECRET),
  ])
  const transport = createCloudflareEmailTransport(requireEmailBinding(env))

  const database = createD1Database(env.DB)

  return createAuth({
    database,
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    turnstileSecret,
    production: runtime.config.APP_ENV === "production",
    isManagedUserAvatar: (userId, image) => isManagedUserAvatar(database, userId, image),
    sendEmail: async (message) => {
      const { rendered } = await renderAuthenticationEmail(message)
      await Effect.runPromise(
        transport.send({
          ...rendered,
          to: message.to,
          from: env.AUTH_EMAIL_FROM,
          replyTo: env.SUPPORT_EMAIL,
          idempotencyKey: message.idempotencyKey,
        }),
      )
    },
    audit: async (action, userId) => {
      await database.insert(schema.auditEvents).values({
        id: crypto.randomUUID(),
        actorId: userId,
        action,
        entityType: "user",
        entityId: userId,
        metadata: {},
      })
    },
    notifyNewDevice: async (userId, sessionId) => {
      const sessions = await database
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, userId))
        .limit(2)
      if (sessions.length < 2) return

      const signedInUser = await database
        .select({
          email: schema.user.email,
          emailNotifications: schema.userSettings.emailNotifications,
          securityNotifications: schema.userSettings.securityNotifications,
        })
        .from(schema.user)
        .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
        .where(eq(schema.user.id, userId))
        .get()
      if (
        !signedInUser ||
        !notificationEnabled(signedInUser.emailNotifications, signedInUser.securityNotifications)
      )
        return

      const rendered = await renderEmail(securityNotificationMessage({ template: "new-device" }))
      await Effect.runPromise(
        transport.send({
          ...rendered,
          to: signedInUser.email,
          from: env.AUTH_EMAIL_FROM,
          replyTo: env.SUPPORT_EMAIL,
          idempotencyKey: `new-device:${sessionId}`,
        }),
      )
    },
    initializeProfile: async (user) => {
      const username = user.username ?? user.email.split("@", 1)[0] ?? user.id
      await database.batch([
        database
          .insert(schema.profiles)
          .values({
            userId: user.id,
            username,
            normalizedUsername: username.toLocaleLowerCase("en-US"),
          })
          .onConflictDoNothing(),
        database.insert(schema.userSettings).values({ userId: user.id }).onConflictDoNothing(),
      ])
    },
    beforeDeleteUser: async (userId) => {
      const mediaIds = await database
        .select({ id: schema.mediaAssets.id })
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.ownerId, userId))
      const id = `account-delete-${userId}`
      const instance = await env.ACCOUNT_DELETION.get(id)
      const existing = await instance.status()
      if (existing.status === "unknown") {
        await env.ACCOUNT_DELETION.create({
          id,
          params: { userId, mediaIds: mediaIds.map(({ id: mediaId }) => mediaId) },
        })
      }
    },
  })
}

export async function recordAuthAudit(context: AppRequestContext, action: string, userId: string) {
  await createD1Database(context.env.DB).insert(schema.auditEvents).values({
    id: crypto.randomUUID(),
    actorId: userId,
    action,
    entityType: "user",
    entityId: userId,
    metadata: {},
  })
}

export async function sendSecurityNotification(
  context: AppRequestContext,
  userId: string,
  template: "password-changed" | "email-changed",
  idempotencyKey: string,
) {
  const preference = await createD1Database(context.env.DB)
    .select({
      email: schema.user.email,
      emailNotifications: schema.userSettings.emailNotifications,
      securityNotifications: schema.userSettings.securityNotifications,
    })
    .from(schema.user)
    .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
    .where(eq(schema.user.id, userId))
    .get()
  if (
    !preference ||
    !notificationEnabled(preference.emailNotifications, preference.securityNotifications)
  )
    return
  const rendered = await renderEmail(securityNotificationMessage({ template }))
  const transport = createCloudflareEmailTransport(requireEmailBinding(context.env))
  await Effect.runPromise(
    transport.send({
      ...rendered,
      to: preference.email,
      from: context.env.AUTH_EMAIL_FROM,
      replyTo: context.env.SUPPORT_EMAIL,
      idempotencyKey,
    }),
  )
}

export function privateAuthResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "private, no-store")
  headers.set("Pragma", "no-cache")
  headers.set("Vary", "Cookie, Authorization")
  return new Response(response.body, { headers, status: response.status })
}
