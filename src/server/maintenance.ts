import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { DateTime, Cause, Clock, Effect, Exit, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"

import { missingProviderObject } from "./account-media-purge"
import { redactExpiredPreviousEmails } from "./email-change-audit"
import { mediaCleanupJob, mediaCleanupJobSchema } from "./jobs"
import { runMaintenanceTasks } from "./maintenance-runner"
import { bindingOperation } from "./operation"
import { storeRefreshedVideoDownload, synchronizeVideoDownload } from "./video-download"

const drainOutbox = Effect.fn("Maintenance.drainOutbox")(function* (env: Cloudflare.Env) {
  const database = createD1Database(env.DB)
  const now = yield* DateTime.nowAsDate
  const pending = yield* bindingOperation("maintenance.drainOutbox", () =>
    database
      .select({ payload: schema.outbox.payload })
      .from(schema.outbox)
      .where(
        and(
          isNull(schema.outbox.processedAt),
          isNull(schema.outbox.deadLetteredAt),
          lte(schema.outbox.availableAt, now),
          or(isNull(schema.outbox.leaseExpiresAt), lte(schema.outbox.leaseExpiresAt, now)),
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
            sql`coalesce(json_extract(${schema.outbox.payload}, '$.type'), '') <> 'redacted'`,
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

const redactEmailChangeAddresses = Effect.fn("Maintenance.redactEmailChangeAddresses")(function* (
  env: Cloudflare.Env,
) {
  const now = yield* Clock.currentTimeMillis
  yield* bindingOperation("maintenance.redactEmailChangeAddresses", () =>
    redactExpiredPreviousEmails(createD1Database(env.DB), now),
  )
})

const cleanExpiredPushSubscriptions = Effect.fn("Maintenance.cleanExpiredPushSubscriptions")(
  function* (env: Cloudflare.Env) {
    const database = createD1Database(env.DB)
    const now = yield* DateTime.nowAsDate
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
  const cutoff = DateTime.toDateUtc(
    DateTime.makeUnsafe((yield* Clock.currentTimeMillis) - 24 * 60 * 60 * 1000),
  )
  const abandoned = yield* bindingOperation("maintenance.queueAbandonedMedia", () =>
    database
      .select({ id: schema.mediaAssets.id })
      .from(schema.mediaAssets)
      .where(
        and(
          or(
            inArray(schema.mediaAssets.status, ["pending", "uploading"]),
            and(
              inArray(schema.mediaAssets.status, ["ready", "failed"]),
              sql`json_type(${schema.mediaAssets.providerMetadata}, '$.editPostId') = 'text'`,
              sql`not exists (select 1 from post_media where media_id = ${schema.mediaAssets.id})`,
            ),
          ),
          lt(schema.mediaAssets.createdAt, cutoff),
        ),
      )
      .limit(100),
  )
  const jobs = abandoned.map(({ id }) => mediaCleanupJob(id))
  const [firstJob, ...remainingJobs] = jobs
  if (!firstJob) return
  const now = yield* Clock.currentTimeMillis
  const encodeJob = (job: (typeof jobs)[number]) =>
    Schema.encodeEffect(Schema.fromJsonString(mediaCleanupJobSchema))(job).pipe(Effect.orDie)
  const insertJob = (job: (typeof jobs)[number], payload: string) =>
    database.$client
      .prepare(
        `insert into outbox (id, kind, payload, attempts, available_at, created_at)
     select ?, ?, ?, 0, ?, ? from media_assets m where m.id = ?
       and (json_type(m.provider_metadata, '$.editPostId') is not 'text'
         or not exists (select 1 from post_media where media_id = m.id))
     on conflict(id) do nothing`,
      )
      .bind(job.idempotencyKey, job.type, payload, now, now, job.mediaId)
  const firstPayload = yield* encodeJob(firstJob)
  const firstStatement = insertJob(firstJob, firstPayload)
  const remainingStatements = yield* Effect.forEach(
    remainingJobs,
    (job) => encodeJob(job).pipe(Effect.map((payload) => insertJob(job, payload))),
    { concurrency: 1 },
  )
  const inserted = yield* bindingOperation("maintenance.queueAbandonedMedia", () =>
    database.$client.batch([firstStatement, ...remainingStatements]),
  )
  yield* Effect.forEach(
    jobs.filter((_, index) => (inserted[index]?.meta.changes ?? 0) > 0),
    (job) => bindingOperation("maintenance.queueAbandonedMedia", () => env.JOBS.send(job)),
    { concurrency: 4 },
  )
})

export type MaintenanceStatement = { sql: string; params: (string | number | null)[] }

const ABANDONED_DRAFT_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Deletes one draft that nobody touched for a day and queues cleanup for its uploads. Both
 * statements re-check the draft, so a draft that was edited or posted meanwhile stays intact.
 * The first statement returns the queued media IDs. The last statement deletes the post.
 */
export function abandonedDraftStatements(postId: string, now: number): MaintenanceStatement[] {
  const cutoff = now - ABANDONED_DRAFT_AGE_MS
  const abandoned =
    "exists (select 1 from posts where id = ? and status = 'draft' and updated_at < ?)"
  return [
    {
      sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
        select 'media.cleanup:' || m.id, 'media.cleanup',
          json_object('type', 'media.cleanup', 'idempotencyKey', 'media.cleanup:' || m.id, 'mediaId', m.id),
          0, ?, ?
        from media_assets m
        where m.status <> 'deleted'
          and (m.id in (select media_id from post_media where post_id = ?)
            or json_extract(m.provider_metadata, '$.postId') = ?)
          and ${abandoned}
        on conflict(id) do nothing
        returning json_extract(payload, '$.mediaId') as mediaId`,
      params: [now, now, postId, postId, postId, cutoff],
    },
    {
      sql: `delete from posts where id = ? and status = 'draft' and updated_at < ?`,
      params: [postId, cutoff],
    },
  ]
}

const removeAbandonedDrafts = Effect.fn("Maintenance.removeAbandonedDrafts")(function* (
  env: Cloudflare.Env,
) {
  const database = createD1Database(env.DB)
  const now = yield* Clock.currentTimeMillis
  const drafts = yield* bindingOperation("maintenance.removeAbandonedDrafts", () =>
    database
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.status, "draft"),
          lt(
            schema.posts.updatedAt,
            DateTime.toDateUtc(DateTime.makeUnsafe(now - ABANDONED_DRAFT_AGE_MS)),
          ),
        ),
      )
      .limit(25),
  )
  const [first, ...rest] = drafts
    .flatMap(({ id }) => abandonedDraftStatements(id, now))
    .map(({ sql: query, params }) => database.$client.prepare(query).bind(...params))
  if (!first) return
  const results = yield* bindingOperation("maintenance.removeAbandonedDrafts", () =>
    database.$client.batch<{ mediaId: string }>([first, ...rest]),
  )
  const jobs = results.flatMap(({ results: rows }) =>
    rows.map(({ mediaId }) => mediaCleanupJob(mediaId)),
  )
  // Queues accepts at most 100 messages per batch. Unsent rows stay pending for the outbox drain.
  for (let offset = 0; offset < jobs.length; offset += 100) {
    const batch = jobs.slice(offset, offset + 100)
    yield* bindingOperation("maintenance.removeAbandonedDrafts", () =>
      env.JOBS.sendBatch(batch.map((job) => ({ body: job }))),
    )
  }
})

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

/** The parts of a Stream video that reconciliation reads. */
export type StreamVideoState = Pick<StreamVideo, "readyToStream" | "duration" | "size"> & {
  status: Pick<StreamVideoStatus, "state">
  input: Pick<StreamVideoInput, "width" | "height">
}

export type StreamVideoLookup = (streamUid: string) => {
  details: () => Promise<StreamVideoState>
  downloads: Pick<StreamScopedDownloads, "generate" | "get">
}

// Only an unfinished upload may change. Cleanup can delete the asset while Stream answers.
function unfinishedVideo(id: string) {
  return and(
    eq(schema.mediaAssets.id, id),
    inArray(schema.mediaAssets.status, ["uploading", "processing"]),
  )
}

export const reconcileStreamAssets = Effect.fn("Maintenance.reconcileStreamAssets")(function* (
  database: Database,
  streamVideo: StreamVideoLookup,
) {
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

  const outcomes = yield* Effect.forEach(
    pending,
    (asset) =>
      Effect.gen(function* () {
        const streamUid = asset.streamUid
        if (!streamUid) return
        const video = yield* bindingOperation("maintenance.reconcileStream", () =>
          streamVideo(streamUid).details(),
        ).pipe(
          Effect.catchIf(
            (error) => missingProviderObject(error.cause),
            () => Effect.undefined,
          ),
        )
        if (!video) {
          // Stream no longer has this video, so it can never finish processing.
          yield* bindingOperation("maintenance.reconcileStream", () =>
            database
              .update(schema.mediaAssets)
              .set({ status: "failed" })
              .where(unfinishedVideo(asset.id)),
          )
          return
        }
        const finalizedAt = video.readyToStream ? yield* DateTime.nowAsDate : undefined
        const failed = video.status.state.toLocaleLowerCase("en-US").includes("error")
        const updated = yield* bindingOperation("maintenance.reconcileStream", () =>
          database
            .update(schema.mediaAssets)
            .set({
              status: video.readyToStream ? "ready" : failed ? "failed" : "processing",
              width: video.input.width || undefined,
              height: video.input.height || undefined,
              duration: video.duration >= 0 ? Math.round(video.duration * 1000) : undefined,
              byteSize: video.size > 0 ? video.size : undefined,
              finalizedAt,
            })
            .where(unfinishedVideo(asset.id))
            .returning({ providerMetadata: schema.mediaAssets.providerMetadata }),
        )
        const row = updated[0]
        if (video.readyToStream && row) {
          const providerMetadata = yield* synchronizeVideoDownload(
            streamVideo(streamUid).downloads,
            row.providerMetadata,
          )
          yield* storeRefreshedVideoDownload(database, asset.id, providerMetadata)
        }
      }).pipe(Effect.exit),
    { concurrency: 4 },
  )
  // One failing video must not stop the others. Report all failures after the batch.
  const failure = outcomes.reduce<Cause.Cause<unknown> | undefined>(
    (cause, outcome) =>
      Exit.isFailure(outcome)
        ? cause
          ? Cause.combine(cause, outcome.cause)
          : outcome.cause
        : cause,
    undefined,
  )
  if (failure) return yield* Effect.failCause(failure)
  return undefined
})

const reconcileStream = Effect.fn("Maintenance.reconcileStream")(function* (env: Cloudflare.Env) {
  yield* reconcileStreamAssets(createD1Database(env.DB), (streamUid) => env.STREAM.video(streamUid))
})

/** Prepares MP4 downloads for ready videos that do not have one yet. */
export const reconcileVideoDownloadAssets = Effect.fn("Maintenance.reconcileVideoDownloadAssets")(
  function* (database: Database, streamVideo: StreamVideoLookup) {
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

    // One failing video must not stop the others. The task still reports each failure.
    yield* runMaintenanceTasks(
      assets.map((asset) => ({
        name: `video-download:${asset.id}`,
        run: Effect.gen(function* () {
          const streamUid = asset.streamUid
          if (!streamUid) return
          const providerMetadata = yield* synchronizeVideoDownload(
            streamVideo(streamUid).downloads,
            asset.providerMetadata,
          )
          yield* storeRefreshedVideoDownload(database, asset.id, providerMetadata)
        }),
      })),
    )
  },
)

const reconcileVideoDownloads = Effect.fn("Maintenance.reconcileVideoDownloads")(function* (
  env: Cloudflare.Env,
) {
  yield* reconcileVideoDownloadAssets(createD1Database(env.DB), (streamUid) =>
    env.STREAM.video(streamUid),
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
    const now = yield* Clock.currentTimeMillis
    const stale = listed.objects.filter(
      (object) => object.uploaded.getTime() < now - 24 * 60 * 60 * 1000,
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
    { name: "email-change-addresses", run: redactEmailChangeAddresses(env) },
    { name: "push-subscriptions", run: cleanExpiredPushSubscriptions(env) },
    { name: "abandoned-media", run: queueAbandonedMedia(env) },
    { name: "abandoned-drafts", run: removeAbandonedDrafts(env) },
    { name: "stream", run: reconcileStream(env) },
    { name: "video-downloads", run: reconcileVideoDownloads(env) },
    { name: "staging", run: cleanStagingObjects(env) },
  ])
})

export function handleScheduled(_controller: ScheduledController, env: Cloudflare.Env) {
  return Effect.runPromise(runMaintenance(env))
}
