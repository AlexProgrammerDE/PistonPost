import { createServerFn } from "@tanstack/react-start"
import { and, asc, count, desc, eq, gt, isNull, like, lt, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { moderationEmailJob } from "@/email"

import { cacheInvalidationJob, mediaCleanupJob } from "./jobs"
import { resolveModerationTransition } from "./moderation-state"
import { assertMutationOrigin, requireAdministrator, requireRequestSession } from "./session"

export const getMyPosts = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const session = await requireRequestSession(context)
  const database = createD1Database(context.env.DB)
  return database
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      type: schema.posts.type,
      status: schema.posts.status,
      visibility: schema.posts.visibility,
      createdAt: schema.posts.createdAt,
      updatedAt: schema.posts.updatedAt,
      version: schema.posts.version,
      comments: sql<number>`(select count(*) from comments where comments.post_id = ${schema.posts.id} and comments.status = 'published')`,
      reactions: sql<number>`(select count(*) from reactions where reactions.post_id = ${schema.posts.id})`,
    })
    .from(schema.posts)
    .where(eq(schema.posts.authorId, session.user.id))
    .orderBy(desc(schema.posts.createdAt), desc(schema.posts.id))
    .limit(500)
})

const adminSection = z.enum(["posts", "comments", "reports", "users", "media", "jobs", "audit"])
const adminPageSize = 20
const adminCursor = z.object({
  createdAt: z.coerce.date(),
  id: z.string().min(1).max(128),
})

function decodeAdminCursor(value: string | undefined) {
  if (!value) return undefined
  try {
    return adminCursor.parse(JSON.parse(atob(value)))
  } catch {
    throw new Error("The administration cursor is invalid.")
  }
}

function encodeAdminCursor(value: z.infer<typeof adminCursor>) {
  return btoa(JSON.stringify(value))
}

function adminCursorCondition(
  createdAt: Parameters<typeof eq>[0],
  id: Parameters<typeof eq>[0],
  cursor: z.infer<typeof adminCursor> | undefined,
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

export const getAdminRows = createServerFn({ method: "GET" })
  .validator(
    z.object({
      section: adminSection,
      query: z.string().trim().max(100).default(""),
      cursor: z.string().max(512).optional(),
      direction: z.enum(["asc", "desc"]).default("desc"),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdministrator(context)
    const database = createD1Database(context.env.DB)
    const search = `%${data.query}%`
    const cursor = decodeAdminCursor(data.cursor)
    const order = data.direction === "desc" ? desc : asc
    switch (data.section) {
      case "posts":
        return adminPage(
          await database
            .select({
              id: schema.posts.id,
              primary: schema.posts.title,
              secondary: schema.user.name,
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
        )
      case "comments":
        return adminPage(
          await database
            .select({
              id: schema.comments.id,
              primary: schema.comments.content,
              secondary: schema.user.name,
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
        )
      case "reports":
        return adminPage(
          await database
            .select({
              id: schema.contentReports.id,
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
        )
      case "users":
        return adminPage(
          await database
            .select({
              id: schema.user.id,
              primary: schema.user.name,
              secondary: schema.profiles.username,
              status: sql<string>`case when ${schema.user.banned} = 1 then 'banned' else coalesce(${schema.user.role}, 'user') end`,
              createdAt: schema.user.createdAt,
            })
            .from(schema.user)
            .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
            .where(
              and(
                data.query
                  ? or(like(schema.user.name, search), like(schema.profiles.username, search))
                  : undefined,
                adminCursorCondition(schema.user.createdAt, schema.user.id, cursor, data.direction),
              ),
            )
            .orderBy(order(schema.user.createdAt), order(schema.user.id))
            .limit(adminPageSize + 1),
        )
      case "media":
        return adminPage(
          await database
            .select({
              id: schema.mediaAssets.id,
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
        )
      case "audit":
        return adminPage(
          await database
            .select({
              id: schema.auditEvents.id,
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
        )
      case "jobs":
        return adminPage(
          await database
            .select({
              id: schema.outbox.id,
              primary: schema.outbox.kind,
              secondary: sql<string>`cast(${schema.outbox.attempts} as text) || ' attempts'`,
              status: sql<string>`case when ${schema.outbox.processedAt} is not null then 'complete' when ${schema.outbox.deadLetteredAt} is not null then 'dead-lettered' when ${schema.outbox.lastError} is not null then 'failed' else 'pending' end`,
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
        )
    }
    throw new Error("Unsupported administration section.")
  })

export const getAdminOverview = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  await requireAdministrator(context)
  const database = createD1Database(context.env.DB)
  const [posts, comments, reports, users, failedMedia, pendingJobs, auditEvents] =
    await Promise.all([
      database.select({ value: count() }).from(schema.posts).get(),
      database.select({ value: count() }).from(schema.comments).get(),
      database
        .select({ value: count() })
        .from(schema.contentReports)
        .where(eq(schema.contentReports.status, "open"))
        .get(),
      database.select({ value: count() }).from(schema.user).get(),
      database
        .select({ value: count() })
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.status, "failed"))
        .get(),
      database
        .select({ value: count() })
        .from(schema.outbox)
        .where(isNull(schema.outbox.processedAt))
        .get(),
      database.select({ value: count() }).from(schema.auditEvents).get(),
    ])

  return {
    posts: posts?.value ?? 0,
    comments: comments?.value ?? 0,
    reports: reports?.value ?? 0,
    users: users?.value ?? 0,
    media: failedMedia?.value ?? 0,
    jobs: pendingJobs?.value ?? 0,
    audit: auditEvents?.value ?? 0,
  }
})

export const updateAdminUser = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().min(1).max(128),
      action: z.enum(["promote", "demote", "ban", "unban"]),
    }),
  )
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireAdministrator(context)
    if (session.user.id === data.id && (data.action === "demote" || data.action === "ban")) {
      throw new Error("You cannot remove your own administrator access.")
    }
    const database = createD1Database(context.env.DB)
    const target = await database
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, data.id))
      .get()
    if (!target) throw new Error("The user was not found.")

    const userUpdate =
      data.action === "promote"
        ? { role: "admin", updatedAt: new Date() }
        : data.action === "demote"
          ? { role: "user", updatedAt: new Date() }
          : data.action === "ban"
            ? { banned: true, banReason: "Administrator action", updatedAt: new Date() }
            : { banned: false, banReason: null, banExpires: null, updatedAt: new Date() }

    await database.batch([
      database.update(schema.user).set(userUpdate).where(eq(schema.user.id, data.id)),
      database.insert(schema.auditEvents).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        action: `user.${data.action}`,
        entityType: "user",
        entityId: data.id,
        metadata: {},
      }),
    ])
    if (data.action === "ban") {
      await database.delete(schema.session).where(eq(schema.session.userId, data.id))
    }
    return { id: data.id, action: data.action }
  })

export const retryAdminJob = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1).max(256) }))
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireAdministrator(context)
    const database = createD1Database(context.env.DB)
    const job = await database
      .select({ payload: schema.outbox.payload, processedAt: schema.outbox.processedAt })
      .from(schema.outbox)
      .where(eq(schema.outbox.id, data.id))
      .get()
    if (!job) throw new Error("The job was not found.")
    if (job.processedAt) throw new Error("This job has already completed.")
    await database.batch([
      database
        .update(schema.outbox)
        .set({
          availableAt: new Date(),
          leaseExpiresAt: null,
          deadLetteredAt: null,
          completedReason: null,
          lastError: null,
        })
        .where(eq(schema.outbox.id, data.id)),
      database
        .update(schema.emailCampaignDeliveries)
        .set({ status: "queued", skipReason: null, completedAt: null })
        .where(eq(schema.emailCampaignDeliveries.id, data.id)),
      database.insert(schema.auditEvents).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        action: "job.retry",
        entityType: "outbox",
        entityId: data.id,
        metadata: {},
      }),
    ])
    context.executionContext.waitUntil(context.env.JOBS.send(job.payload))
    return { id: data.id }
  })

export const cleanupAdminMedia = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireAdministrator(context)
    const database = createD1Database(context.env.DB)
    const asset = await database
      .select({ status: schema.mediaAssets.status })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, data.id))
      .get()
    if (!asset) throw new Error("The media item was not found.")
    if (
      asset.status !== "pending" &&
      asset.status !== "uploading" &&
      asset.status !== "processing" &&
      asset.status !== "failed"
    ) {
      throw new Error("Only unfinished or failed media can be removed here.")
    }
    const job = mediaCleanupJob(data.id)
    await database.batch([
      database
        .insert(schema.outbox)
        .values({ id: job.idempotencyKey, kind: job.type, payload: job })
        .onConflictDoNothing(),
      database.insert(schema.auditEvents).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        action: "media.cleanup",
        entityType: "media",
        entityId: data.id,
        metadata: {},
      }),
    ])
    context.executionContext.waitUntil(context.env.JOBS.send(job))
    return { id: data.id }
  })

export const moderateEntity = createServerFn({ method: "POST" })
  .validator(
    z.object({
      target: z.enum(["post", "comment"]),
      id: z.string().min(1).max(64),
      action: z.enum(["hide", "restore"]),
      reason: z.string().trim().min(3).max(500),
    }),
  )
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireAdministrator(context)
    const database = createD1Database(context.env.DB)
    const target =
      data.target === "post"
        ? await database
            .select({
              id: schema.posts.id,
              postId: schema.posts.id,
              status: schema.posts.status,
              authorId: schema.posts.authorId,
              authorUsername: schema.profiles.username,
            })
            .from(schema.posts)
            .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.posts.authorId))
            .where(eq(schema.posts.id, data.id))
            .get()
        : await database
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
            .get()
    if (!target) throw new Error("The moderation target was not found.")
    const nextStatus = resolveModerationTransition(target.status, data.action)
    if (!nextStatus) {
      throw new Error("The content changed since this table was loaded. Refresh and try again.")
    }
    const expectedStatus = data.action === "hide" ? "published" : "moderated"

    const updateTarget =
      data.target === "post"
        ? database
            .update(schema.posts)
            .set({
              status: nextStatus,
              moderationReason: data.action === "hide" ? data.reason : null,
              updatedAt: new Date(),
            })
            .where(and(eq(schema.posts.id, data.id), eq(schema.posts.status, expectedStatus)))
        : database
            .update(schema.comments)
            .set({
              status: nextStatus,
              moderationReason: data.action === "hide" ? data.reason : null,
              updatedAt: new Date(),
            })
            .where(and(eq(schema.comments.id, data.id), eq(schema.comments.status, expectedStatus)))
    const moderationEventId = crypto.randomUUID()
    const jobs: Array<
      ReturnType<typeof moderationEmailJob> | ReturnType<typeof cacheInvalidationJob>
    > = [cacheInvalidationJob(target.postId)]
    if (target.authorId !== session.user.id) {
      jobs.push(moderationEmailJob(target.authorId, moderationEventId))
    }
    await database.batch([
      updateTarget,
      database.insert(schema.auditEvents).values({
        id: moderationEventId,
        actorId: session.user.id,
        action: `${data.target}.${data.action}`,
        entityType: data.target,
        entityId: data.id,
        metadata: { reason: data.reason },
      }),
      ...jobs.map((job) =>
        database
          .insert(schema.outbox)
          .values({ id: job.idempotencyKey, kind: job.type, payload: job })
          .onConflictDoNothing(),
      ),
    ])
    context.executionContext.waitUntil(
      context.env.JOBS.sendBatch(jobs.map((job) => ({ body: job }))),
    )
    return { id: data.id }
  })
