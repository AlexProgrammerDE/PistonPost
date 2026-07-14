import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import type { EmailJob } from "@pistonpost/email"
import { createServerFn } from "@tanstack/react-start"
import { and, asc, desc, eq, gt, like, lt, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"

import { cacheInvalidationJob } from "./jobs"
import { resolveModerationTransition } from "./moderation-state"
import { notificationEnabled } from "./notification-policy"
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

export const getMyComments = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const session = await requireRequestSession(context)
  return createD1Database(context.env.DB)
    .select({
      id: schema.comments.id,
      content: schema.comments.content,
      status: schema.comments.status,
      createdAt: schema.comments.createdAt,
      postId: schema.posts.id,
      postTitle: schema.posts.title,
    })
    .from(schema.comments)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.comments.postId))
    .where(eq(schema.comments.authorId, session.user.id))
    .orderBy(desc(schema.comments.createdAt))
    .limit(500)
})

export const getMyMedia = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const session = await requireRequestSession(context)
  return createD1Database(context.env.DB)
    .select({
      id: schema.mediaAssets.id,
      filename: schema.mediaAssets.originalFilename,
      kind: schema.mediaAssets.kind,
      status: schema.mediaAssets.status,
      byteSize: schema.mediaAssets.byteSize,
      createdAt: schema.mediaAssets.createdAt,
    })
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.ownerId, session.user.id))
    .orderBy(desc(schema.mediaAssets.createdAt))
    .limit(500)
})

const adminSection = z.enum(["posts", "comments", "users", "media", "jobs", "audit", "migration"])
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
      case "users":
        return adminPage(
          await database
            .select({
              id: schema.user.id,
              primary: schema.user.name,
              secondary: schema.profiles.username,
              status: schema.user.role,
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
              status: schema.outbox.lastError,
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
      case "migration":
        return adminPage(
          await database
            .select({
              id: schema.migrationRuns.id,
              primary: schema.migrationRuns.sourceFingerprint,
              secondary: schema.migrationRuns.state,
              status: schema.migrationRuns.lastError,
              createdAt: schema.migrationRuns.startedAt,
            })
            .from(schema.migrationRuns)
            .where(
              and(
                data.query ? like(schema.migrationRuns.sourceFingerprint, search) : undefined,
                adminCursorCondition(
                  schema.migrationRuns.startedAt,
                  schema.migrationRuns.id,
                  cursor,
                  data.direction,
                ),
              ),
            )
            .orderBy(order(schema.migrationRuns.startedAt), order(schema.migrationRuns.id))
            .limit(adminPageSize + 1),
        )
    }
    throw new Error("Unsupported administration section.")
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
              authorEmail: schema.user.email,
              authorUsername: schema.profiles.username,
              notify: schema.userSettings.moderationNotifications,
              notifyMaster: schema.userSettings.emailNotifications,
            })
            .from(schema.posts)
            .innerJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
            .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.posts.authorId))
            .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.posts.authorId))
            .where(eq(schema.posts.id, data.id))
            .get()
        : await database
            .select({
              id: schema.comments.id,
              postId: schema.comments.postId,
              status: schema.comments.status,
              authorId: schema.comments.authorId,
              authorEmail: schema.user.email,
              authorUsername: schema.profiles.username,
              notify: schema.userSettings.moderationNotifications,
              notifyMaster: schema.userSettings.emailNotifications,
            })
            .from(schema.comments)
            .innerJoin(schema.user, eq(schema.user.id, schema.comments.authorId))
            .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.comments.authorId))
            .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.comments.authorId))
            .where(eq(schema.comments.id, data.id))
            .get()
    if (!target) throw new Error("The moderation target was not found.")
    const nextStatus = resolveModerationTransition(target.status, data.action)
    if (!nextStatus) {
      throw new Error("The content changed since this table was loaded. Refresh and try again.")
    }
    const expectedStatus = data.action === "hide" ? "published" : "moderated"

    if (data.target === "post") {
      await database
        .update(schema.posts)
        .set({
          status: nextStatus,
          moderationReason: data.action === "hide" ? data.reason : null,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.posts.id, data.id), eq(schema.posts.status, expectedStatus)))
    } else {
      await database
        .update(schema.comments)
        .set({
          status: nextStatus,
          moderationReason: data.action === "hide" ? data.reason : null,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.comments.id, data.id), eq(schema.comments.status, expectedStatus)))
    }
    const moderationEventId = crypto.randomUUID()
    await database.insert(schema.auditEvents).values({
      id: moderationEventId,
      actorId: session.user.id,
      action: `${data.target}.${data.action}`,
      entityType: data.target,
      entityId: data.id,
      metadata: { reason: data.reason },
    })

    const jobs: Array<EmailJob | ReturnType<typeof cacheInvalidationJob>> = [
      cacheInvalidationJob(target.postId, target.authorUsername),
    ]
    if (
      target.authorId !== session.user.id &&
      notificationEnabled(target.notifyMaster, target.notify)
    ) {
      jobs.push({
        version: 1,
        type: "email.moderation",
        idempotencyKey: `email.moderation:${moderationEventId}`,
        to: target.authorEmail,
        data: {
          action: data.action === "hide" ? "Your content was hidden" : "Your content was restored",
          reason: data.reason,
          targetUrl: new URL(
            data.target === "post" ? `/post/${target.postId}` : `/post/${target.postId}#discussion`,
            context.runtime.config.PUBLIC_APP_URL,
          ).toString(),
        },
      })
    }
    await database
      .insert(schema.outbox)
      .values(jobs.map((job) => ({ id: job.idempotencyKey, kind: job.type, payload: job })))
      .onConflictDoNothing()
    context.executionContext.waitUntil(Promise.all(jobs.map((job) => context.env.JOBS.send(job))))
    return { id: data.id }
  })
