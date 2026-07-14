import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import {
  createCloudflareEmailTransport,
  decodeEmailJob,
  emailJobContent,
  renderEmail,
} from "@pistonpost/email"
import { and, eq, isNull, sql } from "drizzle-orm"
import { Effect, Either } from "effect"

import { deadLetterMetadata } from "./dead-letter"
import { requireEmailBinding } from "./email-binding"
import { internalJobSchema, type InternalJob } from "./jobs"
import { writeOperationalEvent } from "./operational-events"

async function markOutboxProcessed(id: string, database: ReturnType<typeof createD1Database>) {
  await database
    .update(schema.outbox)
    .set({ processedAt: new Date(), lastError: null })
    .where(eq(schema.outbox.id, id))
}

async function deliverInternalJob(job: InternalJob, env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const existing = await database
    .select({ processedAt: schema.outbox.processedAt })
    .from(schema.outbox)
    .where(eq(schema.outbox.id, job.idempotencyKey))
    .get()
  if (existing?.processedAt) return

  if (job.type === "media.cleanup") {
    const asset = await database
      .select({
        id: schema.mediaAssets.id,
        r2Key: schema.mediaAssets.r2Key,
        streamUid: schema.mediaAssets.streamUid,
        status: schema.mediaAssets.status,
      })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, job.mediaId))
      .get()
    if (asset && asset.status !== "deleted") {
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
    await markOutboxProcessed(job.idempotencyKey, database)
    return
  }

  const origin = new URL(env.PUBLIC_APP_URL).origin
  const publicCache = await caches.open("pistonpost-public")
  await Promise.all(
    job.paths.map((path) => publicCache.delete(new Request(new URL(path, origin).toString()))),
  )
  await markOutboxProcessed(job.idempotencyKey, database)
}

async function deliverEmailJob(body: unknown, env: Cloudflare.Env) {
  const decoded = decodeEmailJob(body)
  if (Either.isLeft(decoded)) return

  const job = decoded.right
  const database = createD1Database(env.DB)
  const existing = await database
    .select({ processedAt: schema.outbox.processedAt })
    .from(schema.outbox)
    .where(eq(schema.outbox.id, job.idempotencyKey))
    .get()

  if (existing?.processedAt) return

  if (!existing) {
    await database
      .insert(schema.outbox)
      .values({
        id: job.idempotencyKey,
        kind: job.type,
        payload: job,
      })
      .onConflictDoNothing()
  }

  const claim = await database
    .update(schema.outbox)
    .set({
      attempts: sql`${schema.outbox.attempts} + 1`,
      processedAt: new Date(),
      lastError: null,
    })
    .where(and(eq(schema.outbox.id, job.idempotencyKey), isNull(schema.outbox.processedAt)))
    .run()

  if (claim.meta.changes === 0) return

  try {
    const rendered = await renderEmail(emailJobContent(job))
    const transport = createCloudflareEmailTransport(requireEmailBinding(env))
    await Effect.runPromise(
      transport.send({
        ...rendered,
        to: job.to,
        from: env.NOTIFICATIONS_EMAIL_FROM,
        replyTo: env.SUPPORT_EMAIL,
        idempotencyKey: job.idempotencyKey,
      }),
    )
  } catch (cause) {
    await database
      .update(schema.outbox)
      .set({
        processedAt: null,
        lastError: cause instanceof Error ? cause.name : "EmailDeliveryError",
      })
      .where(eq(schema.outbox.id, job.idempotencyKey))
    throw cause
  }
}

export async function handleQueue(batch: MessageBatch, env: Cloudflare.Env) {
  if (batch.queue.endsWith("-dead-letter")) {
    const database = createD1Database(env.DB)
    await Promise.all(
      batch.messages.map(async (message) => {
        const metadata = deadLetterMetadata(batch.queue, message)
        await database
          .insert(schema.outbox)
          .values({
            id: `dead-letter:${message.id}`,
            kind: "dead-letter",
            payload: metadata,
            attempts: message.attempts,
            lastError: "Queue retries exhausted.",
          })
          .onConflictDoNothing()
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
    return
  }
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        const internalJob = internalJobSchema.safeParse(message.body)
        if (internalJob.success) await deliverInternalJob(internalJob.data, env)
        else await deliverEmailJob(message.body, env)
        message.ack()
      } catch {
        message.retry()
      }
    }),
  )
}
