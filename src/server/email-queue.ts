import { cache } from "cloudflare:workers"
import { and, eq, isNull } from "drizzle-orm"
import { Cause, Effect, Result, Exit, Layer, Option, Predicate, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import {
  cloudflareEmailTransportLayer,
  decodeEmailQueueJob,
  deliverEmail,
  EmailRenderer,
  type EmailDeliveryJob,
} from "@/email"
import { decodePushDeliveryJob, type PushDeliveryJob } from "@/push/jobs"
import { PushTransport, webPushTransportLayer } from "@/push/transport"

import { mediaCacheTag } from "./cache-tags"
import { deadLetterMetadata } from "./dead-letter"
import { requireEmailBinding } from "./email-binding"
import { readUnsubscribeKeyring } from "./email-config"
import { EmailJobResolver, emailJobResolverLayer } from "./email-job-resolver"
import { internalJobSchema, type InternalJob } from "./jobs"
import { bindingOperation } from "./operation"
import { writeOperationalEvent } from "./operational-events"
import { OutboxRepository, outboxRepositoryLayer } from "./outbox-repository"
import {
  deliverProductBatch,
  productBatchStoreLayer,
  productBatchDispatchLayer,
} from "./product-batch"
import { PushJobResolver, pushJobResolverLayer } from "./push-job-resolver"
import { QueueDeliveryError, queueFailure, withOutboxClaim } from "./queue-job"

async function purgeCacheTags(tags: ReadonlyArray<string>) {
  const result = await cache.purge({ tags: [...new Set(tags)] })
  if (!result.success) throw new Error("Workers Cache purge failed.")
}

async function readSecret(secret: string | SecretsStoreSecret, name: string) {
  const value = (typeof secret === "string" ? secret : await secret.get()).trim()
  if (!value) throw new Error(`Secret binding ${name} is empty.`)
  return value
}

const deliverInternalJob = Effect.fn("Queue.deliverInternalJob")(function* (
  job: InternalJob,
  env: Cloudflare.Env,
) {
  return yield* withOutboxClaim(job, (claim) =>
    Effect.gen(function* () {
      const outbox = yield* OutboxRepository
      const database = createD1Database(env.DB)
      const asset =
        job.type === "media.cleanup"
          ? yield* bindingOperation("media-cleanup.find", () =>
              database
                .select({
                  id: schema.mediaAssets.id,
                  kind: schema.mediaAssets.kind,
                  r2Key: schema.mediaAssets.r2Key,
                  streamUid: schema.mediaAssets.streamUid,
                  status: schema.mediaAssets.status,
                })
                .from(schema.mediaAssets)
                .where(eq(schema.mediaAssets.id, job.mediaId))
                .get(),
            )
          : undefined
      if (asset?.kind === "avatar" && asset.status !== "deleted") {
        const currentAvatar = yield* bindingOperation("media-cleanup.avatar", () =>
          database
            .select({ userId: schema.profiles.userId })
            .from(schema.profiles)
            .where(eq(schema.profiles.avatarMediaId, asset.id))
            .get(),
        )
        if (currentAvatar)
          return yield* new QueueDeliveryError({
            operation: "media-current-avatar",
            retryAfterSeconds: 30,
          })
      }
      return yield* Effect.gen(function* () {
        if (job.type === "media.cleanup") {
          if (asset && asset.status !== "deleted") {
            const { r2Key, streamUid } = asset
            if (r2Key) yield* bindingOperation("media-cleanup.r2", () => env.MEDIA.delete(r2Key))
            if (streamUid)
              yield* bindingOperation("media-cleanup.stream", () =>
                env.STREAM.video(streamUid).delete(),
              )
            yield* bindingOperation("media-cleanup.delete-record", () =>
              database.batch([
                database.delete(schema.postMedia).where(eq(schema.postMedia.mediaId, asset.id)),
                database
                  .update(schema.mediaAssets)
                  .set({ status: "deleted", deletedAt: new Date() })
                  .where(eq(schema.mediaAssets.id, asset.id)),
              ]),
            )
          }
          yield* bindingOperation("media-cleanup.cache", () =>
            purgeCacheTags([mediaCacheTag(job.mediaId)]),
          )
        } else {
          yield* bindingOperation("cache-invalidation.purge", () => purgeCacheTags(job.tags))
        }
        yield* outbox.complete(job.idempotencyKey, claim.attempt, "delivered")
      }).pipe(Effect.uninterruptible)
    }),
  )
})

const deliverEmailJob = Effect.fn("Queue.deliverEmailJob")(function* (
  job: EmailDeliveryJob,
  env: Cloudflare.Env,
) {
  return yield* withOutboxClaim(job, (claim) =>
    Effect.gen(function* () {
      const outbox = yield* OutboxRepository
      const resolver = yield* EmailJobResolver
      const operation = Effect.gen(function* () {
        const resolved = yield* resolver.resolve(job)
        if (Predicate.isTagged(resolved, "Skip")) {
          if (job.type === "email.product") {
            yield* outbox.completeProduct(
              job.idempotencyKey,
              claim.attempt,
              resolved.reason,
              "skipped",
            )
          } else {
            yield* outbox.complete(job.idempotencyKey, claim.attempt, resolved.reason)
          }
          return undefined
        }
        return yield* Effect.gen(function* () {
          const delivery = yield* deliverEmail({
            content: resolved.content,
            to: resolved.to,
            from:
              resolved.channel === "authentication"
                ? env.AUTH_EMAIL_FROM
                : resolved.channel === "marketing"
                  ? env.MARKETING_EMAIL_FROM
                  : env.NOTIFICATIONS_EMAIL_FROM,
            replyTo: env.SUPPORT_EMAIL,
            idempotencyKey: job.idempotencyKey,
          }).pipe(
            Effect.as({ _tag: "Accepted" } as const),
            Effect.catchTag("EmailDeliveryError", (error) =>
              error.retryable
                ? Effect.fail(error)
                : Effect.succeed({ _tag: "Suppressed", reason: error.code } as const),
            ),
          )
          if (Predicate.isTagged(delivery, "Suppressed")) {
            const reason = `provider-${delivery.reason.toLowerCase()}`
            if (job.type === "email.product") {
              yield* outbox.completeProduct(job.idempotencyKey, claim.attempt, reason, "skipped")
            } else {
              yield* outbox.complete(job.idempotencyKey, claim.attempt, reason)
            }
            return undefined
          }
          if (job.type === "email.product") {
            yield* outbox.completeProduct(
              job.idempotencyKey,
              claim.attempt,
              "provider-accepted",
              "sent",
            )
          } else {
            yield* outbox.complete(job.idempotencyKey, claim.attempt, "provider-accepted")
          }
          return undefined
        }).pipe(Effect.uninterruptible)
      })

      yield* operation
      return undefined
    }),
  )
})

const deliverPushJob = Effect.fn("Queue.deliverPushJob")(function* (
  job: PushDeliveryJob,
  env: Cloudflare.Env,
) {
  return yield* withOutboxClaim(job, (claim) =>
    Effect.gen(function* () {
      const outbox = yield* OutboxRepository
      const resolver = yield* PushJobResolver
      const transport = yield* PushTransport
      const operation = Effect.gen(function* () {
        const resolved = yield* resolver
          .resolve(job)
          .pipe(
            Effect.mapError(
              () => new QueueDeliveryError({ operation: "push-resolution", retryAfterSeconds: 30 }),
            ),
          )
        if (Predicate.isTagged(resolved, "Skip")) {
          yield* outbox.complete(job.idempotencyKey, claim.attempt, resolved.reason)
          yield* Effect.sync(() =>
            writeOperationalEvent(env, "push.delivery", [job.type, "skipped", resolved.reason]),
          )
          return undefined
        }

        return yield* Effect.gen(function* () {
          const outcome = yield* transport.send(resolved.target, resolved.payload).pipe(
            Effect.as("accepted" as const),
            Effect.catchTags({
              PushSubscriptionExpired: () => Effect.succeed("expired" as const),
              PushRateLimited: (error) =>
                Effect.fail(
                  new QueueDeliveryError({
                    operation: "push-rate-limited",
                    retryAfterSeconds: error.retryAfterSeconds,
                  }),
                ),
              PushDeliveryError: (error) =>
                error.retryable
                  ? Effect.fail(
                      new QueueDeliveryError({
                        operation: `push-${error.code}`,
                        retryAfterSeconds: 30,
                      }),
                    )
                  : Effect.succeed("rejected" as const),
            }),
          )

          if (outcome === "accepted") {
            yield* Effect.tryPromise({
              try: () =>
                createD1Database(env.DB)
                  .update(schema.pushSubscriptions)
                  .set({ lastSuccessAt: new Date(), updatedAt: new Date() })
                  .where(eq(schema.pushSubscriptions.id, job.subscriptionId)),
              catch: queueFailure("push-mark-success"),
            })
            yield* outbox.complete(job.idempotencyKey, claim.attempt, "provider-accepted")
          } else if (outcome === "expired") {
            yield* Effect.tryPromise({
              try: () =>
                createD1Database(env.DB)
                  .delete(schema.pushSubscriptions)
                  .where(eq(schema.pushSubscriptions.id, job.subscriptionId)),
              catch: queueFailure("push-remove-subscription"),
            })
            yield* outbox.complete(job.idempotencyKey, claim.attempt, "subscription-expired")
          } else {
            yield* outbox.complete(job.idempotencyKey, claim.attempt, "provider-rejected")
          }
          yield* Effect.sync(() => writeOperationalEvent(env, "push.delivery", [job.type, outcome]))
          return undefined
        }).pipe(Effect.uninterruptible)
      })

      yield* operation
      return undefined
    }),
  )
})

const processQueueBody = Effect.fn("Queue.processBody")(function* (
  body: unknown,
  env: Cloudflare.Env,
) {
  const internal = Schema.decodeUnknownResult(internalJobSchema, { errors: "all" })(body)
  if (Result.isSuccess(internal)) {
    yield* deliverInternalJob(internal.success, env)
  } else {
    const push = decodePushDeliveryJob(body)
    if (Result.isSuccess(push)) {
      yield* deliverPushJob(push.success, env)
    } else {
      const decoded = decodeEmailQueueJob(body)
      if (Result.isFailure(decoded)) {
        return yield* new QueueDeliveryError({ operation: "invalid-job", retryAfterSeconds: 30 })
      } else {
        const job = decoded.success
        if (job.type === "email.product-batch") {
          yield* deliverProductBatch(job)
        } else {
          yield* deliverEmailJob(job, env)
        }
      }
    }
  }
  return undefined
})

function originalOutboxId(body: unknown) {
  const internal = Schema.decodeUnknownResult(internalJobSchema, { errors: "all" })(body)
  if (Result.isSuccess(internal)) return internal.success.idempotencyKey
  const email = decodeEmailQueueJob(body)
  if (Result.isSuccess(email)) return email.success.idempotencyKey
  const push = decodePushDeliveryJob(body)
  if (Result.isSuccess(push)) return push.success.idempotencyKey
  if (
    typeof body === "object" &&
    body !== null &&
    "version" in body &&
    body.version === 1 &&
    "type" in body &&
    typeof body.type === "string" &&
    body.type.startsWith("email.") &&
    "idempotencyKey" in body &&
    typeof body.idempotencyKey === "string" &&
    body.idempotencyKey.length <= 256
  ) {
    return body.idempotencyKey
  }
  return null
}

function isLegacyEmailJob(body: unknown) {
  return (
    typeof body === "object" &&
    body !== null &&
    "version" in body &&
    body.version === 1 &&
    "type" in body &&
    typeof body.type === "string" &&
    body.type.startsWith("email.")
  )
}

const handleDeadLetter = Effect.fn("handleDeadLetter")(function* (
  batch: MessageBatch,
  env: Cloudflare.Env,
) {
  yield* Effect.forEach(
    batch.messages,
    (message) =>
      Effect.gen(function* () {
        const database = createD1Database(env.DB)
        const metadata = deadLetterMetadata(batch.queue, message)
        const originalId = originalOutboxId(message.body)
        const redactLegacy = isLegacyEmailJob(message.body)
        const now = new Date()
        const insertDeadLetter = database
          .insert(schema.outbox)
          .values({
            id: `dead-letter:${message.id}`,
            kind: "dead-letter",
            payload: metadata,
            attempts: message.attempts,
            processedAt: now,
            completedReason: "dead-letter-recorded",
            lastError: "Queue retries exhausted.",
          })
          .onConflictDoNothing()
        if (originalId) {
          yield* bindingOperation("handleDeadLetter", () =>
            database.batch([
              insertDeadLetter,
              database
                .update(schema.outbox)
                .set({
                  deadLetteredAt: now,
                  leaseExpiresAt: null,
                  completedReason: "dead-lettered",
                  lastError: "Queue retries exhausted.",
                  ...(redactLegacy
                    ? {
                        payload: {
                          version: 1,
                          type: "redacted",
                          idempotencyKey: originalId,
                        },
                      }
                    : {}),
                })
                .where(and(eq(schema.outbox.id, originalId), isNull(schema.outbox.processedAt))),
              database
                .update(schema.emailCampaignDeliveries)
                .set({ status: "dead-lettered", completedAt: now })
                .where(eq(schema.emailCampaignDeliveries.id, originalId)),
            ]),
          )
        } else {
          yield* bindingOperation("handleDeadLetter", () => insertDeadLetter)
        }
        writeOperationalEvent(
          env,
          "dead-letter.received",
          [metadata.originalType],
          [metadata.attempts],
        )
        console.error(
          JSON.stringify({
            level: "error",
            event: "queue.dead-letter",
            messageId: metadata.messageId,
            originalType: metadata.originalType,
            attempts: metadata.attempts,
          }),
        )
        message.ack()
      }).pipe(Effect.uninterruptible),
    { concurrency: 4 },
  )
})

export async function handleQueue(batch: MessageBatch, env: Cloudflare.Env) {
  if (batch.queue.endsWith("-dead-letter")) {
    await Effect.runPromise(handleDeadLetter(batch, env))
    return
  }
  let vapidPrivateKey: Promise<string> | undefined
  await Effect.runPromise(
    Effect.forEach(
      batch.messages,
      (message) => {
        const database = createD1Database(env.DB)
        const layer = Layer.mergeAll(
          outboxRepositoryLayer(database),
          productBatchStoreLayer(database),
          productBatchDispatchLayer((jobs) => env.JOBS.sendBatch(jobs.map((body) => ({ body })))),
          emailJobResolverLayer(database, {
            baseURL: env.PUBLIC_APP_URL,
            getUnsubscribeSecret: async () =>
              (await readUnsubscribeKeyring(env.EMAIL_UNSUBSCRIBE_SECRET)).current,
          }),
          pushJobResolverLayer(database),
          webPushTransportLayer({
            subject: env.VAPID_SUBJECT,
            publicKey: env.VAPID_PUBLIC_KEY,
            getPrivateKey: () =>
              (vapidPrivateKey ??= readSecret(env.VAPID_PRIVATE_KEY, "VAPID_PRIVATE_KEY")),
          }),
          EmailRenderer.layer,
          cloudflareEmailTransportLayer(requireEmailBinding(env)),
        )
        return processQueueBody(message.body, env).pipe(
          Effect.exit,
          Effect.tap((exit) =>
            Effect.sync(() => {
              if (Exit.isSuccess(exit)) {
                message.ack()
                return
              }
              const failure = Cause.findErrorOption(exit.cause)
              const delaySeconds = Option.match(failure, {
                onNone: () => 30,
                onSome: (error) =>
                  error instanceof QueueDeliveryError ? error.retryAfterSeconds : 30,
              })
              message.retry({ delaySeconds })
            }),
          ),
          Effect.provide(layer),
        )
      },
      { concurrency: 4 },
    ),
  )
}
