import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { and, count, desc, eq, lt, or } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import { listViewerFeedHeartPostIds } from "@/db/public-read-model"
import * as schema from "@/db/schema"
import { commentInputSchema } from "@/domain"
import { commentEmailJob, replyEmailJob } from "@/email"
import { FEED_HEART_BATCH_SIZE } from "@/lib/feed-heart-state"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { commentPushJob, replyPushJob, type PushDeliveryJob } from "@/push/jobs"
import { createRequestAuth } from "@/server/auth"
import { listActivePushSubscriptionIds } from "@/server/push-subscriptions"
import {
  forbiddenFailure,
  invalidInputFailure,
  notFoundFailure,
  rateLimitedFailure,
} from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

const commentCursorSchema = z.object({ createdAt: z.number(), id: z.string() })

function encodeCommentCursor(createdAt: Date, id: string) {
  return btoa(JSON.stringify({ createdAt: createdAt.getTime(), id }))
}

function decodeCommentCursor(cursor: string | undefined) {
  if (!cursor) return null
  try {
    const value = commentCursorSchema.parse(JSON.parse(atob(cursor)))
    return { createdAt: new Date(value.createdAt), id: value.id }
  } catch {
    return null
  }
}

async function optionalViewer(context: Parameters<typeof createRequestAuth>[0]) {
  const auth = await createRequestAuth(context)
  return auth.api.getSession({ headers: getRequestHeaders() })
}

export const getDiscussion = createServerFn({ method: "GET" })
  .validator(
    serverFunctionValidator(
      z.object({
        postId: z.string().min(1).max(64),
        cursor: z.string().max(512).optional(),
        limit: z.number().int().min(1).max(50).default(25),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({ id: schema.posts.id, status: schema.posts.status })
      .from(schema.posts)
      .where(eq(schema.posts.id, data.postId))
      .get()
    if (!post || post.status !== "published") {
      throw notFoundFailure("The post was not found.")
    }
    const cursor = decodeCommentCursor(data.cursor)
    const rows = await database
      .select({
        id: schema.comments.id,
        content: schema.comments.content,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
        authorId: schema.comments.authorId,
        parentId: schema.comments.parentId,
        authorName: schema.user.name,
        authorImage: schema.user.image,
        authorUsername: schema.profiles.username,
      })
      .from(schema.comments)
      .innerJoin(schema.user, eq(schema.user.id, schema.comments.authorId))
      .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.comments.authorId))
      .where(
        and(
          eq(schema.comments.postId, post.id),
          eq(schema.comments.status, "published"),
          ...(cursor
            ? [
                or(
                  lt(schema.comments.createdAt, cursor.createdAt),
                  and(
                    eq(schema.comments.createdAt, cursor.createdAt),
                    lt(schema.comments.id, cursor.id),
                  ),
                ),
              ]
            : []),
        ),
      )
      .orderBy(desc(schema.comments.createdAt), desc(schema.comments.id))
      .limit(data.limit + 1)
    const page = rows.slice(0, data.limit)
    const last = page.at(-1)
    return {
      comments: page,
      nextCursor:
        rows.length > data.limit && last ? encodeCommentCursor(last.createdAt, last.id) : null,
    }
  })

export const getDiscussionViewer = createServerFn({ method: "GET" })
  .validator(serverFunctionValidator(z.object({ postId: z.string().min(1).max(64) })))
  .handler(async ({ context, data }) => {
    const viewer = await optionalViewer(context)
    if (!viewer) {
      return { viewerId: null, viewerRole: null, viewerHasHeart: false }
    }
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(and(eq(schema.posts.id, data.postId), eq(schema.posts.status, "published")))
      .get()
    if (!post) throw notFoundFailure("The post was not found.")
    const heart = await database
      .select({ postId: schema.reactions.postId })
      .from(schema.reactions)
      .where(and(eq(schema.reactions.postId, post.id), eq(schema.reactions.userId, viewer.user.id)))
      .get()
    return {
      viewerId: viewer.user.id,
      viewerRole: viewer.user.role ?? null,
      viewerHasHeart: heart !== undefined,
    }
  })

export const getFeedHeartStates = createServerFn({ method: "GET" })
  .validator(
    serverFunctionValidator(
      z.object({
        postIds: z.array(z.string().min(1).max(64)).min(1).max(FEED_HEART_BATCH_SIZE),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const viewer = await optionalViewer(context)
    if (!viewer) return { heartPostIds: [] }

    const database = createD1Database(context.env.DB)
    const heartPostIds = await listViewerFeedHeartPostIds(database, viewer.user.id, data.postIds)

    return { heartPostIds }
  })

export const setHeart = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(z.object({ postId: z.string().min(1).max(64), active: z.boolean() })),
  )
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const limited = await context.env.REACTION_RATE_LIMITER.limit({ key: session.user.id })
    if (!limited.success) throw rateLimitedFailure("The heart rate limit was reached.")
    const post = await database
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(and(eq(schema.posts.id, data.postId), eq(schema.posts.status, "published")))
      .get()
    if (!post) throw notFoundFailure("The post was not found.")
    if (data.active) {
      await database
        .insert(schema.reactions)
        .values({ postId: post.id, userId: session.user.id })
        .onConflictDoNothing()
    } else {
      await database
        .delete(schema.reactions)
        .where(
          and(eq(schema.reactions.postId, post.id), eq(schema.reactions.userId, session.user.id)),
        )
    }
    const aggregate = await database
      .select({ heartCount: count() })
      .from(schema.reactions)
      .where(eq(schema.reactions.postId, post.id))
      .get()
    return { heartCount: aggregate?.heartCount ?? 0 }
  })

export const createComment = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      z.object({
        postId: z.string().min(1).max(64),
        content: commentInputSchema,
        parentCommentId: z.string().uuid().optional(),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const limited = await context.env.COMMENT_RATE_LIMITER.limit({ key: session.user.id })
    if (!limited.success) throw rateLimitedFailure("The comment rate limit was reached.")
    const post = await database
      .select({ id: schema.posts.id, authorId: schema.posts.authorId })
      .from(schema.posts)
      .where(and(eq(schema.posts.id, data.postId), eq(schema.posts.status, "published")))
      .get()
    if (!post) throw notFoundFailure("The post was not found.")
    const parent = data.parentCommentId
      ? await database
          .select({
            id: schema.comments.id,
            postId: schema.comments.postId,
            authorId: schema.comments.authorId,
            parentId: schema.comments.parentId,
          })
          .from(schema.comments)
          .where(
            and(
              eq(schema.comments.id, data.parentCommentId),
              eq(schema.comments.status, "published"),
            ),
          )
          .get()
      : null
    if (data.parentCommentId && (!parent || parent.postId !== post.id)) {
      throw notFoundFailure("The comment you are replying to was not found.")
    }
    if (parent?.parentId) throw invalidInputFailure("Replies can only be one level deep.")
    const id = crypto.randomUUID()
    const jobs: Array<
      ReturnType<typeof replyEmailJob> | ReturnType<typeof commentEmailJob> | PushDeliveryJob
    > = []
    if (parent && parent.authorId !== session.user.id) {
      jobs.push(replyEmailJob(parent.authorId, id))
      const subscriptions = await listActivePushSubscriptionIds(database, parent.authorId)
      jobs.push(
        ...subscriptions.map(({ subscriptionId }) =>
          replyPushJob({ recipientUserId: parent.authorId, subscriptionId }, id),
        ),
      )
    }
    if (post.authorId !== session.user.id && (!parent || parent.authorId !== post.authorId)) {
      jobs.push(commentEmailJob(post.authorId, id))
      const subscriptions = await listActivePushSubscriptionIds(database, post.authorId)
      jobs.push(
        ...subscriptions.map(({ subscriptionId }) =>
          commentPushJob({ recipientUserId: post.authorId, subscriptionId }, id),
        ),
      )
    }
    await database.batch([
      database.insert(schema.comments).values({
        id,
        postId: post.id,
        authorId: session.user.id,
        parentId: parent?.id,
        content: data.content,
      }),
      ...jobs.map((job) =>
        database
          .insert(schema.outbox)
          .values({ id: job.idempotencyKey, kind: job.type, payload: job })
          .onConflictDoNothing(),
      ),
    ])
    if (jobs.length > 0) {
      context.executionContext.waitUntil(
        context.env.JOBS.sendBatch(jobs.map((job) => ({ body: job }))),
      )
    }
    return { id, content: data.content, parentId: parent?.id ?? null, createdAt: new Date() }
  })

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(z.object({ id: z.string().uuid() })))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const comment = await database
      .select({ id: schema.comments.id, authorId: schema.comments.authorId })
      .from(schema.comments)
      .where(eq(schema.comments.id, data.id))
      .get()
    if (!comment) throw notFoundFailure("The comment was not found.")
    if (comment.authorId !== session.user.id && session.user.role !== "admin") {
      throw forbiddenFailure("You cannot delete this comment.")
    }
    await database
      .update(schema.comments)
      .set({ status: "deleted", deletedAt: new Date(), content: "[deleted]" })
      .where(eq(schema.comments.id, comment.id))
    return { id: comment.id }
  })
