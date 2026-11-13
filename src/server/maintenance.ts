import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm"
import { Effect } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"

import { mediaCleanupJob } from "./jobs"
import { runMaintenanceTasks } from "./maintenance-runner"
import { bindingOperation } from "./operation"
import { synchronizeVideoDownload } from "./video-download"

const drainOutbox = Effect.fn("Maintenance.drainOutbox")(function* (env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const pending = yield* bindingOperation("maintenance.drainOutbox", () =>
    database
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
      .limit(100),
  )
  if (pending.length > 0) {
    yield* bindingOperation("maintenance.drainOutbox", () =>
      env.JOBS.sendBatch(pending.map(({ payload }) => ({ body: payload }))),
    )
  }
})

const redactProcessedLegacyEmailJobs = Effect.fn("Maintenance.redactProcessedLegacyEmailJobs")(
  function* (env: Cloudflare.Env) {
    const database = createD1Database(env.DB)
    const legacy = yield* bindingOperation("maintenance.redactProcessedLegacyEmailJobs", () =>
      database
        .select({ id: schema.outbox.id })
        .from(schema.outbox)
        .where(
          and(
            isNotNull(schema.outbox.processedAt),
            sql`json_extract(${schema.outbox.payload}, '$.version') = 1`,
            sql`${schema.outbox.kind} like 'email.%'`,
          ),
        )
        .limit(100),
    )
    if (legacy.length === 0) return
    yield* Effect.forEach(
      legacy,
      ({ id }) =>
        bindingOperation("maintenance.redactProcessedLegacyEmailJobs", () =>
          database
            .update(schema.outbox)
            .set({ payload: { version: 1, type: "redacted", idempotencyKey: id } })
            .where(eq(schema.outbox.id, id)),
        ),
      { concurrency: 4 },
    )
  },
)

const cleanExpiredPushSubscriptions = Effect.fn("Maintenance.cleanExpiredPushSubscriptions")(
  function* (env: Cloudflare.Env) {
    const database = createD1Database(env.DB)
    const now = new Date()
    const expired = yield* bindingOperation("maintenance.cleanExpiredPushSubscriptions", () =>
      database
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
        .limit(100),
    )
    if (expired.length === 0) return
    yield* bindingOperation("maintenance.cleanExpiredPushSubscriptions", () =>
      database.delete(schema.pushSubscriptions).where(
        inArray(
          schema.pushSubscriptions.id,
          expired.map(({ id }) => id),
        ),
      ),
    )
  },
)

const queueAbandonedMedia = Effect.fn("Maintenance.queueAbandonedMedia")(function* (
  env: Cloudflare.Env,
) {
  const database = createD1Database(env.DB)
  const abandoned = yield* bindingOperation("maintenance.queueAbandonedMedia", () =>
    database
      .select({ id: schema.mediaAssets.id })
      .from(schema.mediaAssets)
      .where(
        and(
          inArray(schema.mediaAssets.status, ["pending", "uploading"]),
          lt(schema.mediaAssets.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1_000)),
        ),
      )
      .limit(100),
  )
  const jobs = abandoned.map(({ id }) => mediaCleanupJob(id))
  const [firstJob, ...remainingJobs] = jobs
  if (!firstJob) return
  const insertJob = (job: (typeof jobs)[number]) =>
    database
      .insert(schema.outbox)
      .values({ id: job.idempotencyKey, kind: job.type, payload: job })
      .onConflictDoNothing()
  yield* bindingOperation("maintenance.queueAbandonedMedia", () =>
    database.batch([insertJob(firstJob), ...remainingJobs.map(insertJob)]),
  )
  yield* Effect.forEach(
    jobs,
    (job) => bindingOperation("maintenance.queueAbandonedMedia", () => env.JOBS.send(job)),
    { concurrency: 4 },
  )
})

const reconcileStream = Effect.fn("Maintenance.reconcileStream")(function* (env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const pending = yield* bindingOperation("maintenance.reconcileStream", () =>
    database
      .select({ id: schema.mediaAssets.id, streamUid: schema.mediaAssets.streamUid })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.kind, "video"),
          or(
            eq(schema.mediaAssets.status, "uploading"),
            eq(schema.mediaAssets.status, "processing"),
          ),
        ),
      )
      .limit(25),
  )

  yield* Effect.forEach(
    pending,
    (asset) =>
      Effect.gen(function* () {
        const streamUid = asset.streamUid
        if (!streamUid) return
        const video = yield* bindingOperation("maintenance.reconcileStream", () =>
          env.STREAM.video(streamUid).details(),
        )
        const failed = video.status.state.toLocaleLowerCase("en-US").includes("error")
        yield* bindingOperation("maintenance.reconcileStream", () =>
          database
            .update(schema.mediaAssets)
            .set({
              status: video.readyToStream ? "ready" : failed ? "failed" : "processing",
              width: video.input.width || undefined,
              height: video.input.height || undefined,
              duration: video.duration >= 0 ? Math.round(video.duration * 1_000) : undefined,
              byteSize: video.size || undefined,
              finalizedAt: video.readyToStream ? new Date() : undefined,
            })
            .where(eq(schema.mediaAssets.id, asset.id)),
        )

        if (video.readyToStream) {
          const row = yield* bindingOperation("maintenance.reconcileStream", () =>
            database
              .select({ providerMetadata: schema.mediaAssets.providerMetadata })
              .from(schema.mediaAssets)
              .where(eq(schema.mediaAssets.id, asset.id))
              .get(),
          )
          if (row) {
            const providerMetadata = yield* synchronizeVideoDownload(
              env.STREAM.video(streamUid).downloads,
              row.providerMetadata,
            )
            yield* bindingOperation("maintenance.reconcileStream", () =>
              database
                .update(schema.mediaAssets)
                .set({ providerMetadata })
                .where(eq(schema.mediaAssets.id, asset.id)),
            )
          }
        }
      }),
    { concurrency: 4 },
  )
})

const reconcileVideoDownloads = Effect.fn("Maintenance.reconcileVideoDownloads")(function* (
  env: Cloudflare.Env,
) {
  const database = createD1Database(env.DB)
  const assets = yield* bindingOperation("maintenance.reconcileVideoDownloads", () =>
    database
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
      .limit(25),
  )

  yield* Effect.forEach(
    assets,
    (asset) =>
      Effect.gen(function* () {
        if (!asset.streamUid) return
        const providerMetadata = yield* synchronizeVideoDownload(
          env.STREAM.video(asset.streamUid).downloads,
          asset.providerMetadata,
        )
        yield* bindingOperation("maintenance.reconcileVideoDownloads", () =>
          database
            .update(schema.mediaAssets)
            .set({ providerMetadata })
            .where(eq(schema.mediaAssets.id, asset.id)),
        )
      }),
    { concurrency: 4 },
  )
})

const cleanStagingObjects = Effect.fn("Maintenance.cleanStagingObjects")(function* (
  env: Cloudflare.Env,
) {
  let cursor: string | undefined
  while (true) {
    const pageCursor = cursor
    const listed = yield* bindingOperation("maintenance.staging.list", () =>
      env.MEDIA.list({ prefix: "staging/", cursor: pageCursor, limit: 100 }),
    )
    const stale = listed.objects.filter(
      (object) => object.uploaded.getTime() < Date.now() - 24 * 60 * 60 * 1_000,
    )
    if (stale.length > 0)
      yield* bindingOperation("maintenance.staging.delete", () =>
        env.MEDIA.delete(stale.map(({ key }) => key)),
      )
    if (!listed.truncated) return
    cursor = listed.cursor
  }
})

const runMaintenance = Effect.fn("Maintenance.runMaintenance")(function* (env: Cloudflare.Env) {
  yield* runMaintenanceTasks([
    { name: "outbox", run: drainOutbox(env) },
    { name: "legacy-email", run: redactProcessedLegacyEmailJobs(env) },
    { name: "push-subscriptions", run: cleanExpiredPushSubscriptions(env) },
    { name: "abandoned-media", run: queueAbandonedMedia(env) },
    { name: "stream", run: reconcileStream(env) },
    { name: "video-downloads", run: reconcileVideoDownloads(env) },
    { name: "staging", run: cleanStagingObjects(env) },
  ])
})

export function handleScheduled(_controller: ScheduledController, env: Cloudflare.Env) {
  return Effect.runPromise(runMaintenance(env))
}
