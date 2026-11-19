import { createServerFn } from "@tanstack/react-start"
import { and, asc, count, desc, eq, gt, isNull, like, lt, or, sql, type SQL } from "drizzle-orm"
import { Schema, SchemaGetter, Effect, SchemaIssue } from "effect"

import { createD1Database, type D1DatabaseClient } from "@/db/d1-database"
import { listActivePushSubscriptionIds } from "@/db/push-subscription-queries"
import * as schema from "@/db/schema"
import { moderationEmailJob } from "@/email"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { moderationPushJob, type PushDeliveryJob } from "@/push/jobs"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import {
  conflictFailure,
  invalidInputFailure,
  notFoundFailure,
} from "@/server/server-function-failure"
import { administratorServerFunctionMiddleware } from "@/server/server-function-middleware"

import { cacheInvalidationJob, mediaCleanupJob, videoAccessJob } from "./jobs"
import { resolveModerationTransition } from "./moderation-state"

const adminSection = Schema.Literals(["posts", "comments", "reports", "media", "jobs", "audit"])
const adminPageSize = 20
const adminCursor = Schema.Struct({
  createdAt: Schema.Unknown.pipe(
    Schema.decodeTo(Schema.Date, {
      decode: SchemaGetter.transformEffect((value) =>
        Effect.try({
          try: () => {
            if (value instanceof Date || typeof value === "string" || typeof value === "number")
              return new Date(value)
            if (value === null || typeof value === "boolean") return new Date(Number(value))
            throw new Error("Invalid date")
          },
          catch: () => new SchemaIssue.InvalidValue({ message: "Invalid date" }),
        }),
      ),
      encode: SchemaGetter.passthrough(),
    }),
  ),
  id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(128)),
})

function decodeAdminCursor(value: string | undefined) {
  if (!value) return
  try {
    return Schema.decodeUnknownSync(adminCursor, { errors: "all" })(JSON.parse(atob(value)))
  } catch {
    throw invalidInputFailure("The administration cursor is invalid.")
  }
}

function encodeAdminCursor(value: (typeof adminCursor)["Type"]) {
  return btoa(JSON.stringify(value))
}

function adminCursorCondition(
  createdAt: Parameters<typeof eq>[0],
  id: Parameters<typeof eq>[0],
  cursor: (typeof adminCursor)["Type"] | undefined,
  direction: "asc" | "desc",
): SQL | undefined {
  if (!cursor) return undefined
  const compareDate =
    direction === "desc" ? lt(createdAt, cursor.createdAt) : gt(createdAt, cursor.createdAt)
  const compareId = direction === "desc" ? lt(id, cursor.id) : gt(id, cursor.id)
  return or(compareDate, and(eq(createdAt, cursor.createdAt), compareId))
}

function adminPage<T extends { createdAt: Date; id: string }>(rows: T[]) {
  const page = rows.slice(0, adminPageSize)
  const last = page.at(-1)
  return {
    rows: page,
    nextCursor:
      rows.length > adminPageSize && last
        ? encodeAdminCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  }
}

export type AdminStatement = { sql: string; params: (string | number | null)[] }

type AdminAudit = {
  id: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  metadata: Record<string, string>
}

type AdminOutboxJob = { idempotencyKey: string; type: string }

function auditStatement(event: AdminAudit, guard: string, guardParams: AdminStatement["params"]) {
  return {
    sql: `insert into audit_events (id, actor_id, action, entity_type, entity_id, metadata, created_at)
      select ?, ?, ?, ?, ?, ?, ? where ${guard}`,
    params: [
      event.id,
      event.actorId,
      event.action,
      event.entityType,
      event.entityId,
      JSON.stringify(event.metadata),
      Date.now(),
      ...guardParams,
    ],
  } satisfies AdminStatement
}

function runAdminStatements(database: D1DatabaseClient, statements: readonly AdminStatement[]) {
  const [first, ...rest] = statements.map(({ sql: query, params }) =>
    database.$client.prepare(query).bind(...params),
  )
  if (!first) return Promise.resolve([])
  return database.$client.batch([first, ...rest])
}

const retryableJob =
  "exists (select 1 from outbox where id = ? and processed_at is null and (lease_expires_at is null or lease_expires_at <= ?))"

/**
 * Resets an unfinished job that no worker holds. The delivery receipt and audit event depend
 * on the same condition in the same batch. The last statement is the outbox reset.
 */
export function retryJobStatements(
  input: { id: string; actorId: string; auditId: string },
  now: number,
): AdminStatement[] {
  return [
    {
      sql: `update email_campaign_deliveries set status = 'queued', skip_reason = null, completed_at = null
        where id = ? and ${retryableJob}`,
      params: [input.id, input.id, now],
    },
    auditStatement(
      {
        id: input.auditId,
        actorId: input.actorId,
        action: "job.retry",
        entityType: "outbox",
        entityId: input.id,
        metadata: {},
      },
      retryableJob,
      [input.id, now],
    ),
    {
      sql: `update outbox set available_at = ?, lease_expires_at = null, dead_lettered_at = null,
          completed_reason = null, last_error = null
        where id = ? and processed_at is null and (lease_expires_at is null or lease_expires_at <= ?)`,
      params: [now, input.id, now],
    },
  ]
}

/**
 * Queues media cleanup, or resets an earlier cleanup that finished, failed, or dead-lettered.
 * A cleanup that a worker currently holds is left alone. The first statement is the claim.
 */
export function adminMediaCleanupStatements(
  input: { mediaId: string; actorId: string; auditId: string },
  now: number,
): AdminStatement[] {
  const job = mediaCleanupJob(input.mediaId)
  return [
    {
      sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
        values (?, ?, ?, 0, ?, ?)
        on conflict(id) do update set available_at = excluded.available_at, processed_at = null,
          lease_expires_at = null, dead_lettered_at = null, completed_reason = null, last_error = null
        where outbox.lease_expires_at is null or outbox.lease_expires_at <= ?`,
      params: [job.idempotencyKey, job.type, JSON.stringify(job), now, now, now],
    },
    auditStatement(
      {
        id: input.auditId,
        actorId: input.actorId,
        action: "media.cleanup",
        entityType: "media",
        entityId: input.mediaId,
        metadata: {},
      },
      "exists (select 1 from outbox where id = ? and processed_at is null and lease_expires_at is null)",
      [job.idempotencyKey],
    ),
  ]
}

type Moderation = {
  target: "post" | "comment"
  id: string
  action: "hide" | "restore"
  reason: string
  actorId: string
  eventId: string
  expectedStatus: "published" | "moderated"
  nextStatus: string
}

const moderationTables = { post: "posts", comment: "comments" } as const

/**
 * The first job claims its outbox row only while the target still has the expected status.
 * The audit event, the remaining jobs, and the status change depend on that claim.
 * The last statement is the status change.
 */
export function moderationStatements(
  input: Moderation,
  [claim, ...jobs]: readonly [AdminOutboxJob, ...AdminOutboxJob[]],
  now: number,
): AdminStatement[] {
  const table = moderationTables[input.target]
  const guard = "exists (select 1 from outbox where id = ?)"
  const outboxValues = (job: AdminOutboxJob) => [
    job.idempotencyKey,
    job.type,
    JSON.stringify(job),
    now,
    now,
  ]
  return [
    {
      sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
        select ?, ?, ?, 0, ?, ? from ${table} t where t.id = ? and t.status = ?`,
      params: [...outboxValues(claim), input.id, input.expectedStatus],
    },
    ...jobs.map((job) => ({
      sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
        select ?, ?, ?, 0, ?, ? where ${guard}
        on conflict(id) do nothing`,
      params: [...outboxValues(job), claim.idempotencyKey],
    })),
    auditStatement(
      {
        id: input.eventId,
        actorId: input.actorId,
        action: `${input.target}.${input.action}`,
        entityType: input.target,
        entityId: input.id,
        metadata: { reason: input.reason },
      },
      guard,
      [claim.idempotencyKey],
    ),
    {
      sql: `update ${table} set status = ?, moderation_reason = ?, updated_at = ?
        where id = ? and status = ? and ${guard}`,
      params: [
        input.nextStatus,
        input.action === "hide" ? input.reason : null,
        now,
        input.id,
        input.expectedStatus,
        claim.idempotencyKey,
      ],
    },
  ]
}

export const getAdminRows = createServerFn({ method: "GET" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        section: adminSection,
        query: Schema.Trim.check(Schema.isMaxLength(100)).pipe(
          Schema.withDecodingDefaultType(Effect.sync(() => "" as const)),
        ),
        cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
        direction: Schema.Literals(["asc", "desc"]).pipe(
          Schema.withDecodingDefaultType(Effect.sync(() => "desc" as const)),
        ),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database } = context
        const search = `%${data.query}%`
        const cursor = decodeAdminCursor(data.cursor)
        const order = data.direction === "desc" ? desc : asc
        switch (data.section) {
          case "posts": {
            return adminPage(
              yield* bindingOperation("getAdminRows.operation", () =>
                database
                  .select({
                    id: schema.posts.id,
                    primary: schema.posts.title,
                    secondary: schema.user.name,
                    href: sql<string | null>`'/post/' || ${schema.posts.id}`,
                    status: schema.posts.status,
                    createdAt: schema.posts.createdAt,
                  })
                  .from(schema.posts)
                  .innerJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
                  .where(
                    and(
                      data.query ? like(schema.posts.title, search) : undefined,
                      adminCursorCondition(
                        schema.posts.createdAt,
                        schema.posts.id,
                        cursor,
                        data.direction,
                      ),
                    ),
                  )
                  .orderBy(order(schema.posts.createdAt), order(schema.posts.id))
                  .limit(adminPageSize + 1),
              ),
            )
          }
          case "comments": {
            return adminPage(
              yield* bindingOperation("getAdminRows.operation", () =>
                database
                  .select({
                    id: schema.comments.id,
                    primary: schema.comments.content,
                    secondary: schema.user.name,
                    href: sql<
                      string | null
                    >`'/post/' || ${schema.comments.postId} || '#comment-' || ${schema.comments.id}`,
                    status: schema.comments.status,
                    createdAt: schema.comments.createdAt,
                  })
                  .from(schema.comments)
                  .innerJoin(schema.user, eq(schema.user.id, schema.comments.authorId))
                  .where(
                    and(
                      data.query ? like(schema.comments.content, search) : undefined,
                      adminCursorCondition(
                        schema.comments.createdAt,
                        schema.comments.id,
                        cursor,
                        data.direction,
                      ),
                    ),
                  )
                  .orderBy(order(schema.comments.createdAt), order(schema.comments.id))
                  .limit(adminPageSize + 1),
              ),
            )
          }
          case "reports": {
            return adminPage(
              yield* bindingOperation("getAdminRows.operation", () =>
                database
                  .select({
                    id: schema.contentReports.id,
                    href: sql<string | null>`null`,
                    primary: sql<string>`${schema.contentReports.reason} || case when ${schema.contentReports.details} is null then '' else ': ' || ${schema.contentReports.details} end`,
                    secondary: sql<string>`case
                when ${schema.contentReports.targetType} = 'post'
                  then '/post/' || ${schema.contentReports.targetId}
                when ${schema.contentReports.targetType} = 'profile'
                  then '/user/' || ${schema.contentReports.targetId}
                else '/post/' || coalesce(
                  (select report_comments.post_id from comments report_comments where report_comments.id = ${schema.contentReports.targetId}),
                  ''
                ) || '#discussion'
              end`,
                    status: schema.contentReports.status,
                    createdAt: schema.contentReports.createdAt,
                  })
                  .from(schema.contentReports)
                  .where(
                    and(
                      data.query
                        ? or(
                            like(schema.contentReports.reason, search),
                            like(schema.contentReports.details, search),
                            like(schema.contentReports.targetId, search),
                          )
                        : undefined,
                      adminCursorCondition(
                        schema.contentReports.createdAt,
                        schema.contentReports.id,
                        cursor,
                        data.direction,
                      ),
                    ),
                  )
                  .orderBy(order(schema.contentReports.createdAt), order(schema.contentReports.id))
                  .limit(adminPageSize + 1),
              ),
            )
          }
          case "media": {
            return adminPage(
              yield* bindingOperation("getAdminRows.operation", () =>
                database
                  .select({
                    id: schema.mediaAssets.id,
                    href: sql<string | null>`null`,
                    primary: schema.mediaAssets.originalFilename,
                    secondary: schema.mediaAssets.kind,
                    status: schema.mediaAssets.status,
                    createdAt: schema.mediaAssets.createdAt,
                  })
                  .from(schema.mediaAssets)
                  .where(
                    and(
                      data.query ? like(schema.mediaAssets.originalFilename, search) : undefined,
                      adminCursorCondition(
                        schema.mediaAssets.createdAt,
                        schema.mediaAssets.id,
                        cursor,
                        data.direction,
                      ),
                    ),
                  )
                  .orderBy(order(schema.mediaAssets.createdAt), order(schema.mediaAssets.id))
                  .limit(adminPageSize + 1),
              ),
            )
          }
          case "audit": {
            return adminPage(
              yield* bindingOperation("getAdminRows.operation", () =>
                database
                  .select({
                    id: schema.auditEvents.id,
                    href: sql<string | null>`null`,
                    primary: schema.auditEvents.action,
                    secondary: schema.auditEvents.entityType,
                    status: schema.auditEvents.entityId,
                    createdAt: schema.auditEvents.createdAt,
                  })
                  .from(schema.auditEvents)
                  .where(
                    and(
                      data.query ? like(schema.auditEvents.action, search) : undefined,
                      adminCursorCondition(
                        schema.auditEvents.createdAt,
                        schema.auditEvents.id,
                        cursor,
                        data.direction,
                      ),
                    ),
                  )
                  .orderBy(order(schema.auditEvents.createdAt), order(schema.auditEvents.id))
                  .limit(adminPageSize + 1),
              ),
            )
          }
          case "jobs": {
            return adminPage(
              yield* bindingOperation("getAdminRows.operation", () =>
                database
                  .select({
                    id: schema.outbox.id,
                    href: sql<string | null>`null`,
                    primary: schema.outbox.kind,
                    secondary: sql<string>`cast(${schema.outbox.attempts} as text) || ' attempts'`,
                    status: sql<string>`case when ${schema.outbox.processedAt} is not null then 'complete' when ${schema.outbox.deadLetteredAt} is not null then 'dead-lettered' when ${schema.outbox.leaseExpiresAt} > (unixepoch() * 1000) then 'running' when ${schema.outbox.lastError} is not null then 'failed' else 'pending' end`,
                    createdAt: schema.outbox.createdAt,
                  })
                  .from(schema.outbox)
                  .where(
                    and(
                      data.query ? like(schema.outbox.kind, search) : undefined,
                      adminCursorCondition(
                        schema.outbox.createdAt,
                        schema.outbox.id,
                        cursor,
                        data.direction,
                      ),
                    ),
                  )
                  .orderBy(order(schema.outbox.createdAt), order(schema.outbox.id))
                  .limit(adminPageSize + 1),
              ),
            )
          }
        }
        return yield* invalidInputFailure("Unsupported administration section.")
      }),
    ),
  )

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([administratorServerFunctionMiddleware])
  .handler(({ context }) =>
    runRequestEffect(
      Effect.gen(function* () {
        // Administrator authorization has already run against the primary.
        // These display counts can lag; action handlers still read current state.
        const database = createD1Database(context.env.DB, "first-unconstrained")
        const [posts, comments, reports, users, failedMedia, pendingJobs, auditEvents] =
          yield* Effect.all(
            [
              bindingOperation("getAdminOverview.operation", () =>
                database.select({ value: count() }).from(schema.posts).get(),
              ),
              bindingOperation("getAdminOverview.operation", () =>
                database.select({ value: count() }).from(schema.comments).get(),
              ),
              bindingOperation("getAdminOverview.operation", () =>
                database
                  .select({ value: count() })
                  .from(schema.contentReports)
                  .where(eq(schema.contentReports.status, "open"))
                  .get(),
              ),
              bindingOperation("getAdminOverview.operation", () =>
                database.select({ value: count() }).from(schema.user).get(),
              ),
              bindingOperation("getAdminOverview.operation", () =>
                database
                  .select({ value: count() })
                  .from(schema.mediaAssets)
                  .where(eq(schema.mediaAssets.status, "failed"))
                  .get(),
              ),
              bindingOperation("getAdminOverview.operation", () =>
                database
                  .select({ value: count() })
                  .from(schema.outbox)
                  .where(
                    and(isNull(schema.outbox.processedAt), isNull(schema.outbox.deadLetteredAt)),
                  )
                  .get(),
              ),
              bindingOperation("getAdminOverview.operation", () =>
                database.select({ value: count() }).from(schema.auditEvents).get(),
              ),
            ],
            { concurrency: 4 },
          )

        return {
          posts: posts?.value ?? 0,
          comments: comments?.value ?? 0,
          reports: reports?.value ?? 0,
          users: users?.value ?? 0,
          media: failedMedia?.value ?? 0,
          jobs: pendingJobs?.value ?? 0,
          audit: auditEvents?.value ?? 0,
        }
      }),
    ),
  )

export const retryAdminJob = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(256)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const job = yield* bindingOperation("retryAdminJob.job", () =>
          database
            .select({ payload: schema.outbox.payload, processedAt: schema.outbox.processedAt })
            .from(schema.outbox)
            .where(eq(schema.outbox.id, data.id))
            .get(),
        )
        if (!job) return yield* notFoundFailure("The job was not found.")
        if (job.processedAt) return yield* conflictFailure("This job has already completed.")
        return yield* Effect.gen(function* () {
          const results = yield* bindingOperation("retryAdminJob.operation", () =>
            runAdminStatements(
              database,
              retryJobStatements(
                { id: data.id, actorId: session.user.id, auditId: crypto.randomUUID() },
                Date.now(),
              ),
            ),
          )
          if (results.at(-1)?.meta.changes !== 1) {
            return yield* conflictFailure(
              "This job is running or has already completed. Refresh and try again.",
            )
          }
          context.executionContext.waitUntil(context.env.JOBS.send(job.payload))
          return { id: data.id }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const cleanupAdminMedia = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(serverFunctionValidator(Schema.Struct({ id: Schema.String.check(Schema.isUUID()) })))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const asset = yield* bindingOperation("cleanupAdminMedia.asset", () =>
          database
            .select({ status: schema.mediaAssets.status })
            .from(schema.mediaAssets)
            .where(eq(schema.mediaAssets.id, data.id))
            .get(),
        )
        if (!asset) return yield* notFoundFailure("The media item was not found.")
        if (
          asset.status !== "pending" &&
          asset.status !== "uploading" &&
          asset.status !== "processing" &&
          asset.status !== "failed"
        ) {
          return yield* conflictFailure("Only unfinished or failed media can be removed here.")
        }
        const job = mediaCleanupJob(data.id)
        return yield* Effect.gen(function* () {
          const results = yield* bindingOperation("cleanupAdminMedia.operation", () =>
            runAdminStatements(
              database,
              adminMediaCleanupStatements(
                { mediaId: data.id, actorId: session.user.id, auditId: crypto.randomUUID() },
                Date.now(),
              ),
            ),
          )
          if (results[0]?.meta.changes !== 1) {
            return yield* conflictFailure("This media item is already being removed.")
          }
          context.executionContext.waitUntil(context.env.JOBS.send(job))
          return { id: data.id }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const moderateEntity = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        target: Schema.Literals(["post", "comment"]),
        id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
        action: Schema.Literals(["hide", "restore"]),
        reason: Schema.Trim.check(Schema.isMinLength(3)).check(Schema.isMaxLength(500)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const target =
          data.target === "post"
            ? yield* bindingOperation("moderateEntity.operation", () =>
                database
                  .select({
                    id: schema.posts.id,
                    postId: schema.posts.id,
                    type: schema.posts.type,
                    status: schema.posts.status,
                    authorId: schema.posts.authorId,
                    authorUsername: schema.profiles.username,
                  })
                  .from(schema.posts)
                  .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.posts.authorId))
                  .where(eq(schema.posts.id, data.id))
                  .get(),
              )
            : yield* bindingOperation("moderateEntity.operation", () =>
                database
                  .select({
                    id: schema.comments.id,
                    postId: schema.comments.postId,
                    status: schema.comments.status,
                    authorId: schema.comments.authorId,
                    authorUsername: schema.profiles.username,
                  })
                  .from(schema.comments)
                  .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.comments.authorId))
                  .where(eq(schema.comments.id, data.id))
                  .get(),
              )
        if (!target) return yield* notFoundFailure("The moderation target was not found.")
        const nextStatus = resolveModerationTransition(target.status, data.action)
        if (!nextStatus) {
          return yield* conflictFailure(
            "The content changed since this table was loaded. Refresh and try again.",
          )
        }
        const expectedStatus = data.action === "hide" ? "published" : "moderated"

        return yield* Effect.gen(function* () {
          const moderationEventId = crypto.randomUUID()
          const jobs: [
            ReturnType<typeof cacheInvalidationJob>,
            ...(
              | ReturnType<typeof moderationEmailJob>
              | ReturnType<typeof videoAccessJob>
              | PushDeliveryJob
            )[],
          ] = [cacheInvalidationJob(target.postId)]
          // Stream videos are uploaded without signed URLs. Hiding a post must also stop playback.
          if ("type" in target && target.type === "video")
            jobs.push(videoAccessJob(target.postId, moderationEventId))
          if (target.authorId !== session.user.id) {
            jobs.push(moderationEmailJob(target.authorId, moderationEventId))
            const subscriptions = yield* bindingOperation("moderateEntity.subscriptions", () =>
              listActivePushSubscriptionIds(database, target.authorId),
            )
            jobs.push(
              ...subscriptions.map(({ subscriptionId }) =>
                moderationPushJob(
                  { recipientUserId: target.authorId, subscriptionId },
                  moderationEventId,
                ),
              ),
            )
          }
          const results = yield* bindingOperation("moderateEntity.operation", () =>
            runAdminStatements(
              database,
              moderationStatements(
                {
                  target: data.target,
                  id: data.id,
                  action: data.action,
                  reason: data.reason,
                  actorId: session.user.id,
                  eventId: moderationEventId,
                  expectedStatus,
                  nextStatus,
                },
                jobs,
                Date.now(),
              ),
            ),
          )
          if (results.at(-1)?.meta.changes !== 1) {
            return yield* conflictFailure(
              "The content changed since this table was loaded. Refresh and try again.",
            )
          }
          context.executionContext.waitUntil(
            context.env.JOBS.sendBatch(jobs.map((job) => ({ body: job }))),
          )
          return { id: data.id }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )
