import { eq } from "drizzle-orm"
import { Cause, Effect, Layer, Option, Schema } from "effect"

import { initializeUserProfile } from "@/auth/profile"
import { createAuth } from "@/auth/server"
import { createD1Database } from "@/db/d1-database"
import { listActivePushSubscriptionIds } from "@/db/push-subscription-queries"
import * as schema from "@/db/schema"
import { securityEmailJob } from "@/email/jobs"
import {
  cloudflareEmailTransportLayer,
  deliverImmediateEmail,
  EmailRenderer,
} from "@/email/transport"
import { randomUuid } from "@/lib/server-uuid"
import { securityPushJob, type PushDeliveryJob } from "@/push/jobs"
import { logError } from "@/server/error-log"

import type { AppRequestContext } from "../server"
import { startAccountDeletion } from "./account-deletion-steps"
import { isManagedUserAvatar } from "./avatar-policy"
import { requireEmailBinding } from "./email-binding"
import { EMAIL_CHANGE_AUDIT_ACTION, emailChangeAuditMetadata } from "./email-change-audit"
import { bindingOperation } from "./operation"

class AuthSecretError extends Schema.TaggedError<
  AuthSecretError,
  { readonly brand: unique symbol }
>()("AuthSecretError", { binding: Schema.String }) {}

const readSecret = Effect.fn("Auth.readSecret")(function* (
  secret: string | SecretsStoreSecret,
  name: string,
) {
  const value = (
    typeof secret === "string"
      ? secret
      : yield* bindingOperation(`auth.secret.${name}`, () => secret.get())
  ).trim()
  if (!value) return yield* AuthSecretError.make({ binding: name })
  return value
})

function reportBackgroundFailure(event: string) {
  return Effect.catchCause((cause) =>
    Effect.sync(() => {
      const error = Option.getOrUndefined(Cause.findErrorOption(cause))
      logError(event, { error: error instanceof Error ? error.name : "UnknownError" })
    }),
  )
}

export const createRequestAuthEffect = Effect.fn("Auth.createRequestAuth")(function* (
  context: AppRequestContext,
) {
  const effectContext = yield* Effect.context()
  const runAuthEffect = Effect.runPromiseWith(effectContext)

  const { env, runtime } = context
  const { betterAuthBackgroundTasks } = yield* bindingOperation(
    "auth.background-tasks",
    () => import("./auth-background-tasks"),
  )
  const baseURL = runtime.config.PUBLIC_APP_URL.toString()
  const [secret, turnstileSecret, betterAuthInfra] = yield* Effect.all(
    [
      readSecret(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
      readSecret(env.TURNSTILE_SECRET, "TURNSTILE_SECRET"),
      runtime.config.BETTER_AUTH_INFRA === "enabled"
        ? readSecret(env.BETTER_AUTH_API_KEY, "BETTER_AUTH_API_KEY").pipe(
            Effect.map((apiKey) => ({ state: "enabled" as const, apiKey })),
          )
        : Effect.succeed({ state: "disabled" as const }),
    ],
    { concurrency: 3 },
  )
  const emailLayer = Layer.mergeAll(
    EmailRenderer.layer,
    cloudflareEmailTransportLayer(requireEmailBinding(env)),
  )
  const database = createD1Database(env.DB)
  const notifyNewDevice = Effect.fn("Auth.notifyNewDevice")(function* (
    userId: string,
    sessionId: string,
  ) {
    const sessions = yield* bindingOperation("auth.device-sessions", () =>
      database
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, userId))
        .limit(2),
    )
    if (sessions.length < 2) return
    yield* enqueueSecurityNotificationEffect(context, userId, "auth.new-device", sessionId)
  })
  const beforeDeleteUser = Effect.fn("Auth.beforeDeleteUser")(function* (userId: string) {
    const mediaIds = yield* bindingOperation("auth.owned-media", () =>
      database
        .select({ id: schema.mediaAssets.id })
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.ownerId, userId)),
    )
    yield* startAccountDeletion(env.ACCOUNT_DELETION, {
      userId,
      mediaIds: mediaIds.map(({ id: mediaId }) => mediaId),
    })
  })

  return createAuth({
    database,
    baseURL,
    betterAuthInfra,
    secret,
    trustedOrigins: [baseURL],
    turnstileSecret,
    production: runtime.config.APP_ENV === "production",
    backgroundTasks: betterAuthBackgroundTasks,
    isManagedUserAvatar: (userId, image) => isManagedUserAvatar(database, userId, image),
    sendEmail: (message) =>
      runAuthEffect(
        deliverImmediateEmail({
          content: message.content,
          to: message.to,
          from: env.AUTH_EMAIL_FROM,
          replyTo: env.SUPPORT_EMAIL,
          idempotencyKey: message.idempotencyKey,
        }).pipe(Effect.provide(emailLayer)),
      ),
    audit: (action, userId) =>
      runAuthEffect(
        randomUuid.pipe(
          Effect.flatMap((id) =>
            bindingOperation("auth.audit", () =>
              database.insert(schema.auditEvents).values({
                id,
                actorId: userId,
                action,
                entityType: "user",
                entityId: userId,
                metadata: {},
              }),
            ),
          ),
          Effect.asVoid,
        ),
      ),
    notifyNewDevice: (userId, sessionId) => {
      context.executionContext.waitUntil(
        runAuthEffect(
          notifyNewDevice(userId, sessionId).pipe(
            reportBackgroundFailure("auth.new-device-notification-failed"),
          ),
        ),
      )
      return Promise.resolve()
    },
    queueSecurityNotification: (userId, action, entityId) => {
      context.executionContext.waitUntil(
        runAuthEffect(
          enqueueSecurityNotificationEffect(context, userId, action, entityId).pipe(
            reportBackgroundFailure("auth.security-notification-failed"),
          ),
        ),
      )
      return Promise.resolve()
    },
    initializeProfile: (user) =>
      runAuthEffect(
        bindingOperation("auth.initialize-profile", () => initializeUserProfile(database, user)),
      ),
    beforeDeleteUser: (userId) => runAuthEffect(beforeDeleteUser(userId)),
  })
})

/** Promise adapter for Better Auth and HTTP request boundaries. */
export function createRequestAuth(context: AppRequestContext) {
  return Effect.runPromise(createRequestAuthEffect(context))
}

const recordAuthAuditEffect = Effect.fn("Auth.recordAudit")(function* (
  context: AppRequestContext,
  action: string,
  userId: string,
) {
  const id = yield* randomUuid
  yield* bindingOperation("auth.audit", () =>
    createD1Database(context.env.DB).insert(schema.auditEvents).values({
      id,
      actorId: userId,
      action,
      entityType: "user",
      entityId: userId,
      metadata: {},
    }),
  )
})

export function recordAuthAudit(context: AppRequestContext, action: string, userId: string) {
  return Effect.runPromise(recordAuthAuditEffect(context, action, userId))
}

const enqueueSecurityNotificationEffect = Effect.fn("Auth.enqueueSecurityNotification")(function* (
  context: AppRequestContext,
  userId: string,
  action:
    | "auth.password-changed"
    | "auth.password-reset"
    | "auth.email-change-requested"
    | "auth.new-device",
  entityId: string,
  previousEmail?: string,
) {
  const database = createD1Database(context.env.DB)
  const auditEventId = yield* randomUuid
  const subscriptions = yield* bindingOperation("auth.security-subscriptions", () =>
    listActivePushSubscriptionIds(database, userId),
  )
  // An email change warns the previous address too, because the new address may be an attacker's.
  const warnedEmail = action === EMAIL_CHANGE_AUDIT_ACTION ? previousEmail : undefined
  const jobs: (ReturnType<typeof securityEmailJob> | PushDeliveryJob)[] = [
    securityEmailJob(userId, auditEventId),
    ...(warnedEmail === undefined
      ? []
      : [securityEmailJob(userId, auditEventId, "previous-email")]),
    ...subscriptions.map(({ subscriptionId }) =>
      securityPushJob({ recipientUserId: userId, subscriptionId }, auditEventId),
    ),
  ]
  yield* Effect.gen(function* () {
    yield* bindingOperation("auth.stage-security-notification", () =>
      database.batch([
        database.insert(schema.auditEvents).values({
          id: auditEventId,
          actorId: userId,
          action,
          entityType: "user",
          entityId,
          metadata: warnedEmail === undefined ? {} : emailChangeAuditMetadata(warnedEmail),
        }),
        ...jobs.map((job) =>
          database
            .insert(schema.outbox)
            .values({ id: job.idempotencyKey, kind: job.type, payload: job })
            .onConflictDoNothing(),
        ),
      ]),
    )
    yield* bindingOperation("auth.dispatch-security-notification", () =>
      context.env.JOBS.sendBatch(jobs.map((job) => ({ body: job }))),
    )
  }).pipe(Effect.uninterruptible)
})

export function enqueueSecurityNotification(
  context: AppRequestContext,
  userId: string,
  action:
    | "auth.password-changed"
    | "auth.password-reset"
    | "auth.email-change-requested"
    | "auth.new-device",
  entityId: string,
  previousEmail?: string,
) {
  return Effect.runPromise(
    enqueueSecurityNotificationEffect(context, userId, action, entityId, previousEmail),
  )
}

export function privateAuthResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "private, no-store")
  headers.set("Pragma", "no-cache")
  headers.set("Vary", "Cookie, Authorization")
  return new Response(response.body, { headers, status: response.status })
}
