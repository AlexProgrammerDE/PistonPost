import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm"
import { Effect } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"

import { mediaCleanupJob } from "./jobs"
import { synchronizeVideoDownload } from "./video-download"

async function drainOutbox(env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const pending = await database
    .select({ payload: schema.outbox.payload })
    .from(schema.outbox)
    .where(
      and(
        isNull(schema.outbox.processedAt),
        isNull(schema.outbox.deadLetteredAt),
        lte(schema.outbox.availableAt, new Date()),
        or(isNull(schema.outbox.leaseExpiresAt), lte(schema.outbox.leaseExpiresAt, new Date())),
      ),
    )
    .limit(100)
  if (pending.length > 0) {
    await env.JOBS.sendBatch(pending.map(({ payload }) => ({ body: payload })))
  }
}

async function redactProcessedLegacyEmailJobs(env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const legacy = await database
    .select({ id: schema.outbox.id })
    .from(schema.outbox)
    .where(
      and(
        isNotNull(schema.outbox.processedAt),
        sql`json_extract(${schema.outbox.payload}, '$.version') = 1`,
        sql`${schema.outbox.kind} like 'email.%'`,
      ),
    )
    .limit(100)
  if (legacy.length === 0) return
  await Promise.all(
    legacy.map(({ id }) =>
      database
        .update(schema.outbox)
        .set({ payload: { version: 1, type: "redacted", idempotencyKey: id } })
        .where(eq(schema.outbox.id, id)),
    ),
  )
}

async function cleanExpiredPushSubscriptions(env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const now = new Date()
  const expired = await database
    .select({ id: schema.pushSubscriptions.id })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.session, eq(schema.session.id, schema.pushSubscriptions.sessionId))
    .where(
      or(
        lte(schema.session.expiresAt, now),
        and(
          isNotNull(schema.pushSubscriptions.expirationTime),
          lte(schema.pushSubscriptions.expirationTime, now),
        ),
      ),
    )
    .limit(100)
  if (expired.length === 0) return
  await database.delete(schema.pushSubscriptions).where(
    inArray(
      schema.pushSubscriptions.id,
      expired.map(({ id }) => id),
    ),
  )
}

async function queueAbandonedMedia(env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const abandoned = await database
    .select({ id: schema.mediaAssets.id })
    .from(schema.mediaAssets)
    .where(
      and(
        inArray(schema.mediaAssets.status, ["pending", "uploading"]),
        lt(schema.mediaAssets.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1_000)),
      ),
    )
    .limit(100)
  const jobs = abandoned.map(({ id }) => mediaCleanupJob(id))
  const [firstJob, ...remainingJobs] = jobs
  if (!firstJob) return
  const insertJob = (job: (typeof jobs)[number]) =>
    database
      .insert(schema.outbox)
      .values({ id: job.idempotencyKey, kind: job.type, payload: job })
      .onConflictDoNothing()
  await database.batch([insertJob(firstJob), ...remainingJobs.map(insertJob)])
  await Promise.all(jobs.map((job) => env.JOBS.send(job)))
}

async function reconcileStream(env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const pending = await database
    .select({ id: schema.mediaAssets.id, streamUid: schema.mediaAssets.streamUid })
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.kind, "video"),
        or(eq(schema.mediaAssets.status, "uploading"), eq(schema.mediaAssets.status, "processing")),
      ),
    )
    .limit(25)

  await Promise.all(
    pending.map(async (asset) => {
      if (!asset.streamUid) return
      const video = await env.STREAM.video(asset.streamUid).details()
      const failed = video.status.state.toLocaleLowerCase("en-US").includes("error")
      await database
        .update(schema.mediaAssets)
        .set({
          status: video.readyToStream ? "ready" : failed ? "failed" : "processing",
          width: video.input.width || undefined,
          height: video.input.height || undefined,
          duration: video.duration >= 0 ? Math.round(video.duration * 1_000) : undefined,
          byteSize: video.size || undefined,
          finalizedAt: video.readyToStream ? new Date() : undefined,
        })
        .where(eq(schema.mediaAssets.id, asset.id))

      if (video.readyToStream) {
        const row = await database
          .select({ providerMetadata: schema.mediaAssets.providerMetadata })
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.id, asset.id))
          .get()
        if (row) {
          const providerMetadata = await Effect.runPromise(
            synchronizeVideoDownload(
              env.STREAM.video(asset.streamUid).downloads,
              row.providerMetadata,
            ),
          )
          await database
            .update(schema.mediaAssets)
            .set({ providerMetadata })
            .where(eq(schema.mediaAssets.id, asset.id))
        }
      }
    }),
  )
}

async function reconcileVideoDownloads(env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const assets = await database
    .select({
      id: schema.mediaAssets.id,
      streamUid: schema.mediaAssets.streamUid,
      providerMetadata: schema.mediaAssets.providerMetadata,
    })
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.kind, "video"),
        eq(schema.mediaAssets.status, "ready"),
        sql`coalesce(json_extract(${schema.mediaAssets.providerMetadata}, '$.streamDownloadStatus'), '') <> 'ready'`,
      ),
    )
    .limit(25)

  await Promise.all(
    assets.map(async (asset) => {
      if (!asset.streamUid) return
      const providerMetadata = await Effect.runPromise(
        synchronizeVideoDownload(
          env.STREAM.video(asset.streamUid).downloads,
          asset.providerMetadata,
        ),
      )
      await database
        .update(schema.mediaAssets)
        .set({ providerMetadata })
        .where(eq(schema.mediaAssets.id, asset.id))
    }),
  )
}

async function cleanStagingObjects(env: Cloudflare.Env, cursor?: string): Promise<void> {
  const listed = await env.MEDIA.list({ prefix: "staging/", cursor, limit: 100 })
  const stale = listed.objects.filter(
    (object) => object.uploaded.getTime() < Date.now() - 24 * 60 * 60 * 1_000,
  )
  if (stale.length > 0) await env.MEDIA.delete(stale.map(({ key }) => key))
  if (listed.truncated) await cleanStagingObjects(env, listed.cursor)
}

export async function handleScheduled(_controller: ScheduledController, env: Cloudflare.Env) {
  await Promise.all([
    drainOutbox(env),
    redactProcessedLegacyEmailJobs(env),
    cleanExpiredPushSubscriptions(env),
    queueAbandonedMedia(env),
    reconcileStream(env),
    reconcileVideoDownloads(env),
    cleanStagingObjects(env),
  ])
}
