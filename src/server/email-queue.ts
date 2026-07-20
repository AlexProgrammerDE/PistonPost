import { cache } from "cloudflare:workers"
import { and, eq, gt, isNull } from "drizzle-orm"
import { Effect, Either, Exit, Layer, Predicate, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import {
  cloudflareEmailTransportLayer,
  decodeEmailQueueJob,
  deliverEmail,
  EmailRenderer,
  productEmailBatchJob,
  productEmailJob,
  type EmailDeliveryJob,
  type ProductEmailBatchJob,
} from "@/email"

import { mediaCacheTag } from "./cache-tags"
import { deadLetterMetadata } from "./dead-letter"
import { requireEmailBinding } from "./email-binding"
import { EmailJobResolver, emailJobResolverLayer } from "./email-job-resolver"
import { internalJobSchema, type InternalJob } from "./jobs"
import { writeOperationalEvent } from "./operational-events"
import { OutboxRepository, outboxRepositoryLayer } from "./outbox-repository"

export class QueueDeliveryError extends Schema.TaggedError<QueueDeliveryError>()(
  "QueueDeliveryError",
  { operation: Schema.String },
) {}

function queueFailure(operation: string) {
  return () => new QueueDeliveryError({ operation })
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return "UnknownError"
  const tag = Reflect.get(error, "_tag")
  return typeof tag === "string" ? tag : "UnknownError"
}

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
  const outbox = yield* OutboxRepository
  yield* outbox.ensure(job.idempotencyKey, job.type, job)
  const claim = yield* outbox.claim(job.idempotencyKey)
  if (Predicate.isTagged(claim, "Deferred")) {
    yield* Effect.fail(new QueueDeliveryError({ operation: "outbox-deferred" }))
  }
  if (!Predicate.isTagged(claim, "Claimed")) return

  const operation = Effect.tryPromise({
    try: async () => {
      const database = createD1Database(env.DB)
      if (job.type === "media.cleanup") {
        const asset = await database
          .select({
            id: schema.mediaAssets.id,
            kind: schema.mediaAssets.kind,
            r2Key: schema.mediaAssets.r2Key,
            streamUid: schema.mediaAssets.streamUid,
            status: schema.mediaAssets.status,
          })
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.id, job.mediaId))
          .get()
        if (asset && asset.status !== "deleted") {
          if (asset.kind === "avatar") {
            const currentAvatar = await database
              .select({ userId: schema.profiles.userId })
              .from(schema.profiles)
              .where(eq(schema.profiles.avatarMediaId, asset.id))
              .get()
            if (currentAvatar) throw new Error("A current avatar cannot be removed.")
          }
          if (asset.r2Key) await env.MEDIA.delete(asset.r2Key)
          if (asset.streamUid) await env.STREAM.video(asset.streamUid).delete()
          await database.batch([
            database.delete(schema.postMedia).where(eq(schema.postMedia.mediaId, asset.id)),
            database
              .update(schema.mediaAssets)
              .set({ status: "deleted", deletedAt: new Date() })
              .where(eq(schema.mediaAssets.id, asset.id)),
          ])
        }
        await purgeCacheTags([mediaCacheTag(job.mediaId)])
        return
      }

      await purgeCacheTags(job.tags)
    },
    catch: queueFailure("internal-job"),
  }).pipe(
    Effect.tapError((error) => outbox.release(job.idempotencyKey, claim.attempt, errorCode(error))),
  )

  yield* operation
  yield* outbox.complete(job.idempotencyKey, "delivered")
})

const deliverEmailJob = Effect.fn("Queue.deliverEmailJob")(function* (
  job: EmailDeliveryJob,
  env: Cloudflare.Env,
) {
  const outbox = yield* OutboxRepository
  const resolver = yield* EmailJobResolver
  yield* outbox.ensure(job.idempotencyKey, job.type, job)
  const claim = yield* outbox.claim(job.idempotencyKey)
  if (Predicate.isTagged(claim, "Deferred")) {
    yield* Effect.fail(new QueueDeliveryError({ operation: "outbox-deferred" }))
  }
  if (!Predicate.isTagged(claim, "Claimed")) return

  const operation = Effect.gen(function* () {
    const resolved = yield* resolver.resolve(job)
    if (Predicate.isTagged(resolved, "Skip")) {
      if (job.type === "email.product") {
        yield* outbox.completeProduct(job.idempotencyKey, resolved.reason, "skipped")
      } else {
        yield* outbox.complete(job.idempotencyKey, resolved.reason)
      }
      return
    }
    yield* deliverEmail({
      content: resolved.content,
      to: resolved.to,
      from:
        resolved.channel === "authentication" ? env.AUTH_EMAIL_FROM : env.NOTIFICATIONS_EMAIL_FROM,
      replyTo: env.SUPPORT_EMAIL,
      idempotencyKey: job.idempotencyKey,
    })
    if (job.type === "email.product") {
      yield* outbox.completeProduct(job.idempotencyKey, "provider-accepted", "sent")
    } else {
      yield* outbox.complete(job.idempotencyKey, "provider-accepted")
    }
  }).pipe(
    Effect.tapError((error) => outbox.release(job.idempotencyKey, claim.attempt, errorCode(error))),
  )

  yield* operation
})

const deliverProductBatch = Effect.fn("Queue.deliverProductBatch")(function* (
  job: ProductEmailBatchJob,
  env: Cloudflare.Env,
) {
  const outbox = yield* OutboxRepository
  yield* outbox.ensure(job.idempotencyKey, job.type, job)
  const claim = yield* outbox.claim(job.idempotencyKey)
  if (Predicate.isTagged(claim, "Deferred")) {
    yield* Effect.fail(new QueueDeliveryError({ operation: "outbox-deferred" }))
  }
  if (!Predicate.isTagged(claim, "Claimed")) return

  const operation = Effect.tryPromise({
    try: async () => {
      const database = createD1Database(env.DB)
      const campaign = await database
        .select({ status: schema.emailCampaigns.status })
        .from(schema.emailCampaigns)
        .where(eq(schema.emailCampaigns.id, job.campaignId))
        .get()
      if (!campaign || campaign.status === "draft") return []

      const recipients = await database
        .select({ id: schema.user.id })
        .from(schema.user)
        .innerJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
        .where(
          and(
            eq(schema.userSettings.productNotifications, true),
            job.cursorUserId ? gt(schema.user.id, job.cursorUserId) : undefined,
          ),
        )
        .orderBy(schema.user.id)
        .limit(100)
      const deliveryJobs = recipients.map(({ id }) => productEmailJob(id, job.campaignId))
      const lastRecipient = recipients.at(-1)
      const nextBatch =
        recipients.length === 100 && lastRecipient
          ? productEmailBatchJob(job.campaignId, lastRecipient.id)
          : null
      const insertOutbox = (deliveryJob: (typeof deliveryJobs)[number]) =>
        database
          .insert(schema.outbox)
          .values({
            id: deliveryJob.idempotencyKey,
            kind: deliveryJob.type,
            payload: deliveryJob,
          })
          .onConflictDoNothing()
      const insertDelivery = (deliveryJob: (typeof deliveryJobs)[number]) =>
        database
          .insert(schema.emailCampaignDeliveries)
          .values({
            id: deliveryJob.idempotencyKey,
            campaignId: deliveryJob.campaignId,
            recipientUserId: deliveryJob.recipientUserId,
          })
          .onConflictDoNothing()
      const deliveryJobBatches: Array<typeof deliveryJobs> = []
      for (let offset = 0; offset < deliveryJobs.length; offset += 25) {
        deliveryJobBatches.push(deliveryJobs.slice(offset, offset + 25))
      }
      await Promise.all(
        deliveryJobBatches.map((deliveryJobBatch) => {
          const [firstJob, ...remainingJobs] = deliveryJobBatch
          if (!firstJob) return Promise.resolve([])
          return database.batch([
            insertOutbox(firstJob),
            insertDelivery(firstJob),
            ...remainingJobs.flatMap((deliveryJob) => [
              insertOutbox(deliveryJob),
              insertDelivery(deliveryJob),
            ]),
          ])
        }),
      )
      if (nextBatch) {
        await database
          .insert(schema.outbox)
          .values({ id: nextBatch.idempotencyKey, kind: nextBatch.type, payload: nextBatch })
          .onConflictDoNothing()
      } else {
        await database
          .update(schema.emailCampaigns)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.emailCampaigns.id, job.campaignId))
      }
      return nextBatch ? [...deliveryJobs, nextBatch] : deliveryJobs
    },
    catch: queueFailure("product-batch"),
  }).pipe(
    Effect.flatMap((jobs) =>
      jobs.length === 0
        ? Effect.void
        : Effect.tryPromise({
            try: () => env.JOBS.sendBatch(jobs.map((nextJob) => ({ body: nextJob }))),
            catch: queueFailure("product-batch-dispatch"),
          }),
    ),
    Effect.tapError((error) => outbox.release(job.idempotencyKey, claim.attempt, errorCode(error))),
  )

  yield* operation
  yield* outbox.complete(job.idempotencyKey, "batch-created")
})

const processQueueBody = Effect.fn("Queue.processBody")(function* (
  body: unknown,
  env: Cloudflare.Env,
) {
  const internal = internalJobSchema.safeParse(body)
  if (internal.success) {
    yield* deliverInternalJob(internal.data, env)
  } else {
    const decoded = decodeEmailQueueJob(body)
    if (Either.isLeft(decoded)) {
      yield* Effect.fail(new QueueDeliveryError({ operation: "invalid-job" }))
    } else {
      const job = decoded.right
      if (job.type === "email.product-batch") {
        yield* deliverProductBatch(job, env)
      } else {
        yield* deliverEmailJob(job, env)
      }
    }
  }
})

function originalOutboxId(body: unknown) {
  const internal = internalJobSchema.safeParse(body)
  if (internal.success) return internal.data.idempotencyKey
  const email = decodeEmailQueueJob(body)
  if (Either.isRight(email)) return email.right.idempotencyKey
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

async function handleDeadLetter(batch: MessageBatch, env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  await Promise.all(
    batch.messages.map(async (message) => {
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
        await database.batch([
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
        ])
      } else {
        await insertDeadLetter
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
    }),
  )
}

export async function handleQueue(batch: MessageBatch, env: Cloudflare.Env) {
  if (batch.queue.endsWith("-dead-letter")) {
    await handleDeadLetter(batch, env)
    return
  }
  const database = createD1Database(env.DB)
  const layer = Layer.mergeAll(
    outboxRepositoryLayer(database),
    emailJobResolverLayer(database, {
      baseURL: env.PUBLIC_APP_URL,
      getUnsubscribeSecret: () =>
        readSecret(env.EMAIL_UNSUBSCRIBE_SECRET, "EMAIL_UNSUBSCRIBE_SECRET"),
    }),
    EmailRenderer.live,
    cloudflareEmailTransportLayer(requireEmailBinding(env)),
  )
  await Effect.runPromise(
    Effect.forEach(
      batch.messages,
      (message) =>
        processQueueBody(message.body, env).pipe(
          Effect.exit,
          Effect.tap((exit) =>
            Effect.sync(() => {
              if (Exit.isSuccess(exit)) message.ack()
              else message.retry()
            }),
          ),
        ),
      { concurrency: "unbounded" },
    ).pipe(Effect.provide(layer)),
  )
}
