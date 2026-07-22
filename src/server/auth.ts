import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { createAuth } from "@/auth/server"
import { createD1Database } from "@/db/d1-database"
import { listActivePushSubscriptionIds } from "@/db/push-subscription-queries"
import * as schema from "@/db/schema"
import {
  cloudflareEmailTransportLayer,
  deliverImmediateEmail,
  EmailRenderer,
  securityEmailJob,
} from "@/email"
import { securityPushJob, type PushDeliveryJob } from "@/push/jobs"

import type { AppRequestContext } from "../server"
import { isManagedUserAvatar } from "./avatar-policy"
import { requireEmailBinding } from "./email-binding"

async function readSecret(secret: string | SecretsStoreSecret, name: string) {
  const value = (typeof secret === "string" ? secret : await secret.get()).trim()
  if (!value) throw new Error(`Secret binding ${name} is empty.`)
  return value
}

export async function createRequestAuth(context: AppRequestContext) {
  const { env, runtime } = context
  const baseURL = runtime.config.PUBLIC_APP_URL.toString()
  const [secret, turnstileSecret, betterAuthApiKey] = await Promise.all([
    readSecret(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
    readSecret(env.TURNSTILE_SECRET, "TURNSTILE_SECRET"),
    readSecret(env.BETTER_AUTH_API_KEY, "BETTER_AUTH_API_KEY"),
  ])
  const emailLayer = Layer.mergeAll(
    EmailRenderer.live,
    cloudflareEmailTransportLayer(requireEmailBinding(env)),
  )

  const database = createD1Database(env.DB)

  return createAuth({
    database,
    baseURL,
    betterAuthApiKey,
    secret,
    trustedOrigins: [baseURL],
    turnstileSecret,
    production: runtime.config.APP_ENV === "production",
    runInBackground: (promise) => context.executionContext.waitUntil(promise),
    isManagedUserAvatar: (userId, image) => isManagedUserAvatar(database, userId, image),
    sendEmail: async (message) => {
      await Effect.runPromise(
        deliverImmediateEmail({
          content: message.content,
          to: message.to,
          from: env.AUTH_EMAIL_FROM,
          replyTo: env.SUPPORT_EMAIL,
          idempotencyKey: message.idempotencyKey,
        }).pipe(Effect.provide(emailLayer)),
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
      context.executionContext.waitUntil(
        (async () => {
          const sessions = await database
            .select({ id: schema.session.id })
            .from(schema.session)
            .where(eq(schema.session.userId, userId))
            .limit(2)
          if (sessions.length < 2) return
          await enqueueSecurityNotification(context, userId, "auth.new-device", sessionId)
        })().catch((cause) => {
          console.error(
            JSON.stringify({
              level: "error",
              event: "auth.new-device-notification-failed",
              error: cause instanceof Error ? cause.name : "UnknownError",
            }),
          )
        }),
      )
    },
    queueSecurityNotification: async (userId, action, entityId) => {
      context.executionContext.waitUntil(
        enqueueSecurityNotification(context, userId, action, entityId).catch((cause) => {
          console.error(
            JSON.stringify({
              level: "error",
              event: "auth.security-notification-failed",
              error: cause instanceof Error ? cause.name : "UnknownError",
            }),
          )
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

export async function enqueueSecurityNotification(
  context: AppRequestContext,
  userId: string,
  action:
    | "auth.password-changed"
    | "auth.password-reset"
    | "auth.email-change-requested"
    | "auth.new-device",
  entityId: string,
) {
  const database = createD1Database(context.env.DB)
  const auditEventId = crypto.randomUUID()
  const subscriptions = await listActivePushSubscriptionIds(database, userId)
  const jobs: Array<ReturnType<typeof securityEmailJob> | PushDeliveryJob> = [
    securityEmailJob(userId, auditEventId),
    ...subscriptions.map(({ subscriptionId }) =>
      securityPushJob({ recipientUserId: userId, subscriptionId }, auditEventId),
    ),
  ]
  await database.batch([
    database.insert(schema.auditEvents).values({
      id: auditEventId,
      actorId: userId,
      action,
      entityType: "user",
      entityId,
      metadata: {},
    }),
    ...jobs.map((job) =>
      database
        .insert(schema.outbox)
        .values({ id: job.idempotencyKey, kind: job.type, payload: job })
        .onConflictDoNothing(),
    ),
  ])
  await context.env.JOBS.sendBatch(jobs.map((job) => ({ body: job })))
}

export function privateAuthResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "private, no-store")
  headers.set("Pragma", "no-cache")
  headers.set("Vary", "Cookie, Authorization")
  return new Response(response.body, { headers, status: response.status })
}
