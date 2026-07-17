import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { and, desc, eq, lt, or, sql } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { commentInputSchema } from "@/domain"
import { commentEmailJob, replyEmailJob } from "@/email"
import { createRequestAuth } from "@/server/auth"
import { assertMutationOrigin, requireRequestSession } from "@/server/session"

const reactionType = z.enum(["like", "dislike", "heart"])
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
    z.object({
      postId: z.string().min(1).max(64),
      cursor: z.string().max(512).optional(),
      limit: z.number().int().min(1).max(50).default(25),
    }),
  )
  .handler(async ({ context, data }) => {
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({ id: schema.posts.id, status: schema.posts.status })
      .from(schema.posts)
      .where(eq(schema.posts.id, data.postId))
      .get()
    if (!post || post.status !== "published") throw new Error("The post was not found.")
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
  .validator(z.object({ postId: z.string().min(1).max(64) }))
  .handler(async ({ context, data }) => {
    const viewer = await optionalViewer(context)
    if (!viewer) {
      return { viewerId: null, viewerRole: null, viewerReactions: [] }
    }
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(and(eq(schema.posts.id, data.postId), eq(schema.posts.status, "published")))
      .get()
    if (!post) throw new Error("The post was not found.")
    const reactions = await database
      .select({ type: schema.reactions.type })
      .from(schema.reactions)
      .where(and(eq(schema.reactions.postId, post.id), eq(schema.reactions.userId, viewer.user.id)))
    return {
      viewerId: viewer.user.id,
      viewerRole: viewer.user.role ?? null,
      viewerReactions: reactions.map(({ type }) => type),
    }
  })

export const setReaction = createServerFn({ method: "POST" })
  .validator(
    z.object({ postId: z.string().min(1).max(64), type: reactionType, active: z.boolean() }),
  )
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const limited = await context.env.REACTION_RATE_LIMITER.limit({ key: session.user.id })
    if (!limited.success) throw new Error("The reaction rate limit was reached.")
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(and(eq(schema.posts.id, data.postId), eq(schema.posts.status, "published")))
      .get()
    if (!post) throw new Error("The post was not found.")
    if (data.active) {
      await database
        .insert(schema.reactions)
        .values({ postId: post.id, userId: session.user.id, type: data.type })
        .onConflictDoNothing()
    } else {
      await database
        .delete(schema.reactions)
        .where(
          and(
            eq(schema.reactions.postId, post.id),
            eq(schema.reactions.userId, session.user.id),
            eq(schema.reactions.type, data.type),
          ),
        )
    }
    const counts = await database
      .select({ type: schema.reactions.type, count: sql<number>`count(*)` })
      .from(schema.reactions)
      .where(eq(schema.reactions.postId, post.id))
      .groupBy(schema.reactions.type)
    return Object.fromEntries(counts.map(({ type, count }) => [type, count]))
  })

export const createComment = createServerFn({ method: "POST" })
  .validator(
    z.object({
      postId: z.string().min(1).max(64),
      content: commentInputSchema,
      parentCommentId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const limited = await context.env.COMMENT_RATE_LIMITER.limit({ key: session.user.id })
    if (!limited.success) throw new Error("The comment rate limit was reached.")
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({ id: schema.posts.id, authorId: schema.posts.authorId })
      .from(schema.posts)
      .where(and(eq(schema.posts.id, data.postId), eq(schema.posts.status, "published")))
      .get()
    if (!post) throw new Error("The post was not found.")
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
      throw new Error("The comment you are replying to was not found.")
    }
    if (parent?.parentId) throw new Error("Replies can only be one level deep.")
    const id = crypto.randomUUID()
    const jobs: Array<ReturnType<typeof replyEmailJob> | ReturnType<typeof commentEmailJob>> = []
    if (parent && parent.authorId !== session.user.id) {
      jobs.push(replyEmailJob(parent.authorId, id))
    }
    if (post.authorId !== session.user.id && (!parent || parent.authorId !== post.authorId)) {
      jobs.push(commentEmailJob(post.authorId, id))
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
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const comment = await database
      .select({ id: schema.comments.id, authorId: schema.comments.authorId })
      .from(schema.comments)
      .where(eq(schema.comments.id, data.id))
      .get()
    if (!comment) throw new Error("The comment was not found.")
    if (comment.authorId !== session.user.id && session.user.role !== "admin") {
      throw new Error("You cannot delete this comment.")
    }
    await database
      .update(schema.comments)
      .set({ status: "deleted", deletedAt: new Date(), content: "[deleted]" })
      .where(eq(schema.comments.id, comment.id))
    return { id: comment.id }
  })
