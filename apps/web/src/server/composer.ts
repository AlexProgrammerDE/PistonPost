import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import { postDraftInputSchema } from "@pistonpost/domain"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { z } from "zod"

import { assertMutationOrigin, requireRequestSession } from "@/server/session"

import { cacheInvalidationJob, mediaCleanupJob } from "./jobs"

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
const MAX_IMAGES_PER_POST = 20

function nextPublicId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16)
}

async function tagId(normalized: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized))
  return `tag_${Array.from(new Uint8Array(digest).slice(0, 10), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`
}

export const createPostDraft = createServerFn({ method: "POST" })
  .validator(postDraftInputSchema)
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const id = nextPublicId()
    const normalizedTags = [...new Set(data.tags.map((tag) => tag.toLocaleLowerCase("en-US")))]
    const tagsWithIds = await Promise.all(
      normalizedTags.map(async (normalized, ordinal) => ({
        id: await tagId(normalized),
        normalized,
        display:
          data.tags.find((tag) => tag.toLocaleLowerCase("en-US") === normalized) ?? normalized,
        ordinal,
      })),
    )
    const statements: Array<D1PreparedStatement> = [
      context.env.DB.prepare(
        `insert into posts
          (id, author_id, type, status, visibility, title, text_content, created_at, updated_at, version)
         values (?, ?, ?, 'draft', ?, ?, ?, ?, ?, 1)`,
      ).bind(
        id,
        session.user.id,
        data.type,
        data.visibility,
        data.title,
        data.type === "text" ? data.textContent : null,
        Date.now(),
        Date.now(),
      ),
    ]

    for (const tag of tagsWithIds) {
      statements.push(
        context.env.DB.prepare(
          `insert into tags (id, display_name, normalized_name, created_at)
           values (?, ?, ?, ?)
           on conflict(normalized_name) do update set display_name = excluded.display_name`,
        ).bind(tag.id, tag.display, tag.normalized, Date.now()),
        context.env.DB.prepare(
          `insert into post_tags (post_id, tag_id, ordinal)
           select ?, id, ? from tags where normalized_name = ?`,
        ).bind(id, tag.ordinal, tag.normalized),
      )
    }

    await context.env.DB.batch(statements)
    return { id, version: 1 }
  })

const imageIntentInput = z.object({
  postId: z.string().min(1).max(64),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  byteSize: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  altText: z.string().trim().max(300),
})

export const createImageUploadIntent = createServerFn({ method: "POST" })
  .validator(imageIntentInput)
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const rateLimit = await context.env.UPLOAD_RATE_LIMITER.limit({ key: session.user.id })
    if (!rateLimit.success) throw new Error("The upload rate limit was reached.")

    const database = createD1Database(context.env.DB)
    const draft = await database
      .select({ id: schema.posts.id, type: schema.posts.type })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.id, data.postId),
          eq(schema.posts.authorId, session.user.id),
          eq(schema.posts.status, "draft"),
        ),
      )
      .get()
    if (!draft || draft.type !== "images") throw new Error("The image draft was not found.")

    const assets = await database
      .select({ count: sql<number>`count(*)` })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.ownerId, session.user.id),
          ne(schema.mediaAssets.status, "deleted"),
        ),
      )
      .get()
    if ((assets?.count ?? 0) >= 500) throw new Error("The account media quota was reached.")

    const postAssetCount = await context.env.DB.prepare(
      `select count(*) as count from media_assets
       where json_extract(provider_metadata, '$.postId') = ?
         and status not in ('failed', 'deleted')`,
    )
      .bind(data.postId)
      .first<{ count: number }>()
    if ((postAssetCount?.count ?? 0) >= MAX_IMAGES_PER_POST) {
      throw new Error(`A new post can contain at most ${MAX_IMAGES_PER_POST.toString()} images.`)
    }

    const id = crypto.randomUUID()
    await database.insert(schema.mediaAssets).values({
      id,
      ownerId: session.user.id,
      kind: "image",
      provider: "r2",
      status: "pending",
      originalFilename: data.filename,
      mimeType: data.mimeType,
      byteSize: data.byteSize,
      altText: data.altText || null,
      providerMetadata: {
        postId: data.postId,
        expiresAt: Date.now() + 15 * 60 * 1000,
        ordinal: postAssetCount?.count ?? 0,
      },
    })
    return { assetId: id, uploadUrl: `/media/upload/${id}`, expiresInSeconds: 900 }
  })

const videoIntentInput = z.object({
  postId: z.string().min(1).max(64),
  filename: z.string().trim().min(1).max(255),
  mimeType: z
    .string()
    .trim()
    .regex(/^video\//),
  byteSize: z.number().int().min(1).max(MAX_VIDEO_BYTES),
})

export const createVideoUploadIntent = createServerFn({ method: "POST" })
  .validator(videoIntentInput)
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const rateLimit = await context.env.UPLOAD_RATE_LIMITER.limit({ key: session.user.id })
    if (!rateLimit.success) throw new Error("The upload rate limit was reached.")

    const database = createD1Database(context.env.DB)
    const draft = await database
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.id, data.postId),
          eq(schema.posts.authorId, session.user.id),
          eq(schema.posts.type, "video"),
          eq(schema.posts.status, "draft"),
        ),
      )
      .get()
    if (!draft) throw new Error("The video draft was not found.")

    const existing = await database
      .select({ id: schema.postMedia.mediaId })
      .from(schema.postMedia)
      .where(eq(schema.postMedia.postId, data.postId))
      .get()
    if (existing) throw new Error("A video draft can contain one video.")

    const assetId = crypto.randomUUID()
    const upload = await context.env.STREAM.createDirectUpload({
      maxDurationSeconds: 600,
      expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      creator: session.user.id,
      allowedOrigins: [new URL(context.runtime.config.PUBLIC_APP_URL).hostname],
      requireSignedURLs: false,
      meta: { assetId, postId: data.postId },
      scheduledDeletion: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
    })

    try {
      await database.batch([
        database.insert(schema.mediaAssets).values({
          id: assetId,
          ownerId: session.user.id,
          kind: "video",
          provider: "stream",
          status: "uploading",
          streamUid: upload.id,
          originalFilename: data.filename,
          mimeType: data.mimeType,
          byteSize: data.byteSize,
        }),
        database
          .insert(schema.postMedia)
          .values({ postId: data.postId, mediaId: assetId, ordinal: 0 }),
      ])
    } catch (cause) {
      await context.env.STREAM.video(upload.id)
        .delete()
        .catch(() => undefined)
      throw cause
    }

    return { assetId, uploadUrl: upload.uploadURL, streamUid: upload.id }
  })

export const getOwnedMediaStatus = createServerFn({ method: "GET" })
  .validator(z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_IMAGES_PER_POST) }))
  .handler(async ({ context, data }) => {
    const session = await requireRequestSession(context)
    return createD1Database(context.env.DB)
      .select({ id: schema.mediaAssets.id, status: schema.mediaAssets.status })
      .from(schema.mediaAssets)
      .where(
        and(
          inArray(schema.mediaAssets.id, data.ids),
          eq(schema.mediaAssets.ownerId, session.user.id),
        ),
      )
  })

export const abortMediaUpload = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const asset = await database
      .select({ id: schema.mediaAssets.id, status: schema.mediaAssets.status })
      .from(schema.mediaAssets)
      .where(
        and(eq(schema.mediaAssets.id, data.id), eq(schema.mediaAssets.ownerId, session.user.id)),
      )
      .get()
    if (!asset) throw new Error("The upload was not found.")
    if (asset.status === "ready" || asset.status === "deleted") {
      throw new Error("A finalized upload cannot be aborted.")
    }
    const job = mediaCleanupJob(asset.id)
    await database
      .insert(schema.outbox)
      .values({ id: job.idempotencyKey, kind: job.type, payload: job })
      .onConflictDoNothing()
    context.executionContext.waitUntil(context.env.JOBS.send(job))
    return { id: asset.id, status: "cancelled" as const }
  })

export const publishPost = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1).max(64), version: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const post = await database
      .select()
      .from(schema.posts)
      .where(and(eq(schema.posts.id, data.id), eq(schema.posts.authorId, session.user.id)))
      .get()
    if (!post || post.status !== "draft") throw new Error("The draft was not found.")
    if (post.version !== data.version) throw new Error("The draft changed in another session.")

    const media = await database
      .select({
        status: schema.mediaAssets.status,
        kind: schema.mediaAssets.kind,
        streamUid: schema.mediaAssets.streamUid,
      })
      .from(schema.postMedia)
      .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
      .where(
        and(eq(schema.postMedia.postId, post.id), eq(schema.mediaAssets.ownerId, session.user.id)),
      )
    if (post.type === "images" && (media.length < 1 || media.length > MAX_IMAGES_PER_POST)) {
      throw new Error("An image post needs between 1 and 20 ready images.")
    }
    if (post.type === "video" && media.length !== 1) {
      throw new Error("A video post needs one ready video.")
    }
    if (media.some((asset) => asset.status !== "ready")) {
      throw new Error("Media is still processing.")
    }
    const video = media.find((asset) => asset.kind === "video")
    if (video?.streamUid) {
      await context.env.STREAM.video(video.streamUid).update({ scheduledDeletion: null })
    }

    const result = await database
      .update(schema.posts)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
        version: data.version + 1,
      })
      .where(
        and(
          eq(schema.posts.id, data.id),
          eq(schema.posts.authorId, session.user.id),
          eq(schema.posts.version, data.version),
        ),
      )
      .run()
    if (result.meta.changes !== 1) throw new Error("The draft changed in another session.")

    const invalidate = cacheInvalidationJob(post.id)
    await database.insert(schema.outbox).values({
      id: invalidate.idempotencyKey,
      kind: invalidate.type,
      payload: invalidate,
    })
    context.executionContext.waitUntil(context.env.JOBS.send(invalidate))
    return { id: post.id, version: data.version + 1 }
  })

export const getOwnedPostForEditing = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().min(1).max(64) }))
  .handler(async ({ context, data }) => {
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const post = await database
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.id, data.id))
      .get()
    if (!post || post.status === "deleted") throw new Error("The post was not found.")
    if (post.authorId !== session.user.id && session.user.role !== "admin") {
      throw new Error("The post was not found.")
    }
    const tags = await database
      .select({ name: schema.tags.displayName })
      .from(schema.postTags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.postTags.tagId))
      .where(eq(schema.postTags.postId, post.id))
      .orderBy(schema.postTags.ordinal)
    return { ...post, tags: tags.map(({ name }) => name) }
  })

const updatePostInput = z.object({
  id: z.string().min(1).max(64),
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(100),
  textContent: z.string().trim().min(1).max(1_000).nullable(),
  tags: z.array(z.string().trim().min(1).max(64)).min(1).max(5),
  visibility: z.enum(["public", "unlisted"]),
})

export const updatePost = createServerFn({ method: "POST" })
  .validator(updatePostInput)
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({
        id: schema.posts.id,
        type: schema.posts.type,
        status: schema.posts.status,
        authorId: schema.posts.authorId,
      })
      .from(schema.posts)
      .where(eq(schema.posts.id, data.id))
      .get()
    if (!post || post.status === "deleted") throw new Error("The post was not found.")
    if (post.authorId !== session.user.id && session.user.role !== "admin") {
      throw new Error("You cannot edit this post.")
    }
    if (post.type === "text" && !data.textContent) throw new Error("Text posts need text content.")

    const update = await database
      .update(schema.posts)
      .set({
        title: data.title,
        textContent: post.type === "text" ? data.textContent : null,
        visibility: data.visibility,
        updatedAt: new Date(),
        version: data.version + 1,
      })
      .where(and(eq(schema.posts.id, post.id), eq(schema.posts.version, data.version)))
      .run()
    if (update.meta.changes !== 1) throw new Error("The post changed in another session.")

    const normalizedTags = [...new Set(data.tags.map((tag) => tag.toLocaleLowerCase("en-US")))]
    const tagsWithIds = await Promise.all(
      normalizedTags.map(async (normalized, ordinal) => ({
        id: await tagId(normalized),
        normalized,
        display:
          data.tags.find((tag) => tag.toLocaleLowerCase("en-US") === normalized) ?? normalized,
        ordinal,
      })),
    )
    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare("delete from post_tags where post_id = ?").bind(post.id),
    ]
    for (const tag of tagsWithIds) {
      statements.push(
        context.env.DB.prepare(
          `insert into tags (id, display_name, normalized_name, created_at)
           values (?, ?, ?, ?)
           on conflict(normalized_name) do update set display_name = excluded.display_name`,
        ).bind(tag.id, tag.display, tag.normalized, Date.now()),
        context.env.DB.prepare(
          `insert into post_tags (post_id, tag_id, ordinal)
           select ?, id, ? from tags where normalized_name = ?`,
        ).bind(post.id, tag.ordinal, tag.normalized),
      )
    }
    await context.env.DB.batch(statements)

    if (post.status === "published") {
      const invalidate = cacheInvalidationJob(post.id)
      await database.insert(schema.outbox).values({
        id: invalidate.idempotencyKey,
        kind: invalidate.type,
        payload: invalidate,
      })
      context.executionContext.waitUntil(context.env.JOBS.send(invalidate))
    }
    return { id: post.id, version: data.version + 1 }
  })

export const deletePost = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1).max(64), version: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const post = await database
      .select({ authorId: schema.posts.authorId, status: schema.posts.status })
      .from(schema.posts)
      .where(eq(schema.posts.id, data.id))
      .get()
    if (!post || post.status === "deleted") throw new Error("The post was not found.")
    if (post.authorId !== session.user.id && session.user.role !== "admin") {
      throw new Error("You cannot delete this post.")
    }
    const media = await database
      .select({ id: schema.mediaAssets.id })
      .from(schema.postMedia)
      .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
      .where(eq(schema.postMedia.postId, data.id))
    const cleanupJobs = media.map(({ id }) => mediaCleanupJob(id))
    const invalidate = cacheInvalidationJob(data.id)
    const deleted = await database
      .update(schema.posts)
      .set({
        status: "deleted",
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: data.version + 1,
      })
      .where(
        and(
          eq(schema.posts.id, data.id),
          eq(schema.posts.version, data.version),
          ne(schema.posts.status, "deleted"),
        ),
      )
      .run()
    if (deleted.meta.changes !== 1) throw new Error("The post changed in another session.")

    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare("delete from comments where post_id = ?").bind(data.id),
      context.env.DB.prepare("delete from reactions where post_id = ?").bind(data.id),
      context.env.DB.prepare("delete from post_tags where post_id = ?").bind(data.id),
      ...cleanupJobs.map((job) =>
        context.env.DB.prepare(
          `insert into outbox (id, kind, payload, attempts, available_at, created_at)
           values (?, ?, ?, 0, ?, ?) on conflict(id) do nothing`,
        ).bind(job.idempotencyKey, job.type, JSON.stringify(job), Date.now(), Date.now()),
      ),
      context.env.DB.prepare(
        `insert into outbox (id, kind, payload, attempts, available_at, created_at)
         values (?, ?, ?, 0, ?, ?)`,
      ).bind(
        invalidate.idempotencyKey,
        invalidate.type,
        JSON.stringify(invalidate),
        Date.now(),
        Date.now(),
      ),
    ]
    await context.env.DB.batch(statements)
    context.executionContext.waitUntil(
      Promise.all([...cleanupJobs, invalidate].map((job) => context.env.JOBS.send(job))).then(
        () => undefined,
      ),
    )
    return { id: data.id }
  })
