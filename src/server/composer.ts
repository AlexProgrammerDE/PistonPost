import { createServerFn } from "@tanstack/react-start"
import { and, count, eq, gte, ne } from "drizzle-orm"
import { Schema, Struct, Effect } from "effect"

import type { D1DatabaseClient } from "@/db/d1-database"
import { ownedMediaStatusQuery } from "@/db/media-read-model"
import { postEditStatements } from "@/db/post-edit-statements"
import * as schema from "@/db/schema"
import {
  MAX_IMAGES_PER_POST,
  MAX_POST_MARKDOWN_LENGTH,
  postDraftInputSchema,
  tagSchema,
} from "@/domain"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { TURNSTILE_ACTIONS } from "@/lib/turnstile"
import {
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE,
} from "@/lib/uploads/image-upload-policy"
import {
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_UPLOAD_BYTES,
} from "@/lib/uploads/video-upload-policy"
import {
  DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT,
  MAX_VIDEO_THUMBNAIL_TIMESTAMP_PCT,
  MIN_VIDEO_THUMBNAIL_TIMESTAMP_PCT,
} from "@/lib/video-thumbnail"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import {
  conflictFailure,
  forbiddenFailure,
  invalidInputFailure,
  notFoundFailure,
  rateLimitedFailure,
} from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"
import { createStreamDirectUpload, isStreamNotFoundError } from "@/server/stream-direct-upload"
import { turnstileTokenSchema, verifyRequestTurnstile } from "@/server/turnstile"

import { cacheInvalidationJob, mediaCleanupJob } from "./jobs"
import {
  guardedAuditStatement,
  postDeleteStatements,
  postPublishStatements,
  type Statement,
} from "./post-lifecycle-statements"

const BASIC_STREAM_UPLOAD_MAX_BYTES = 200_000_000
// One intent batch holds up to 20 images. Slow connections need time to send all of them.
const IMAGE_UPLOAD_INTENT_TTL_SECONDS = 60 * 60
const RECENT_POST_LIMIT = 10
const RECENT_POST_WINDOW_MS = 10 * 60 * 1_000

const postColumns = {
  id: schema.posts.id,
  authorId: schema.posts.authorId,
  type: schema.posts.type,
  status: schema.posts.status,
  visibility: schema.posts.visibility,
  title: schema.posts.title,
  textContent: schema.posts.textContent,
  createdAt: schema.posts.createdAt,
  updatedAt: schema.posts.updatedAt,
  publishedAt: schema.posts.publishedAt,
  deletedAt: schema.posts.deletedAt,
  moderationReason: schema.posts.moderationReason,
  version: schema.posts.version,
}

function nextPublicId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16)
}

function userRateLimit(limiter: RateLimit, key: string, message: string) {
  return bindingOperation(`userRateLimit.${key.split(":", 1)[0] ?? "action"}`, () =>
    limiter.limit({ key }),
  ).pipe(
    Effect.flatMap((limited) =>
      limited.success ? Effect.void : Effect.fail(rateLimitedFailure(message)),
    ),
  )
}

function enforceRecentPostLimit(database: D1DatabaseClient, userId: string) {
  const recentWindow = new Date(Date.now() - RECENT_POST_WINDOW_MS)
  return bindingOperation("recentPostLimit.count", () =>
    database
      .select({ value: count() })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.authorId, userId),
          eq(schema.posts.status, "published"),
          gte(schema.posts.publishedAt, recentWindow),
        ),
      )
      .get(),
  ).pipe(
    Effect.flatMap((recentPublishes) =>
      (recentPublishes?.value ?? 0) < RECENT_POST_LIMIT
        ? Effect.void
        : Effect.fail(
            rateLimitedFailure(
              "You can post up to 10 times every 10 minutes. Try again in a bit.",
              RECENT_POST_WINDOW_MS / 1_000,
            ),
          ),
    ),
  )
}

function prepareStatements(database: D1DatabaseClient, statements: readonly Statement[]) {
  return statements.map(({ sql, params }) => database.$client.prepare(sql).bind(...params))
}

const tagId = Effect.fn("tagId")(function* (normalized: string) {
  const digest = yield* bindingOperation("tagId.digest", () =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)),
  )
  return `tag_${Array.from(new Uint8Array(digest).slice(0, 10), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`
})

export const createPostDraft = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({ draft: postDraftInputSchema, turnstileToken: turnstileTokenSchema }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { session } = context
        const limited = yield* bindingOperation("createPostDraft.limited", () =>
          context.env.USER_RATE_LIMITER.limit({
            key: `draft:${session.user.id}`,
          }),
        )
        if (!limited.success)
          return yield* rateLimitedFailure("Too many posts were started at once.")
        // Check before uploads start so people do not send a full gallery that cannot be posted.
        yield* enforceRecentPostLimit(context.database, session.user.id)
        yield* verifyRequestTurnstile(context, data.turnstileToken, TURNSTILE_ACTIONS.createPost)
        const input = data.draft
        const id = nextPublicId()
        const normalizedTags = [...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US")))]
        const tagsWithIds = yield* Effect.forEach(
          normalizedTags,
          (normalized, ordinal) =>
            Effect.gen(function* () {
              return {
                id: yield* tagId(normalized),
                normalized,
                display:
                  input.tags.find((tag) => tag.toLocaleLowerCase("en-US") === normalized) ??
                  normalized,
                ordinal,
              }
            }),
          { concurrency: 4 },
        )
        const statements: Array<D1PreparedStatement> = [
          context.database.$client
            .prepare(
              `insert into posts
          (id, author_id, type, status, visibility, title, text_content, created_at, updated_at, version)
         values (?, ?, ?, 'draft', ?, ?, ?, ?, ?, 1)`,
            )
            .bind(
              id,
              session.user.id,
              input.type,
              input.visibility,
              input.title,
              input.type === "text" ? input.textContent : null,
              Date.now(),
              Date.now(),
            ),
        ]

        for (const tag of tagsWithIds) {
          statements.push(
            context.database.$client
              .prepare(
                `insert into tags (id, display_name, normalized_name, created_at)
           values (?, ?, ?, ?)
           on conflict(normalized_name) do update set display_name = excluded.display_name`,
              )
              .bind(tag.id, tag.display, tag.normalized, Date.now()),
            context.database.$client
              .prepare(
                `insert into post_tags (post_id, tag_id, ordinal)
           select ?, id, ? from tags where normalized_name = ?`,
              )
              .bind(id, tag.ordinal, tag.normalized),
          )
        }

        return yield* Effect.gen(function* () {
          yield* bindingOperation("createPostDraft.operation", () =>
            context.database.$client.batch(statements),
          )
          return { id, version: 1 }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

const imageIntentInput = Schema.Struct({
  postId: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
  filename: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
  mimeType: Schema.Literals(IMAGE_UPLOAD_MIME_TYPES),
  byteSize: Schema.Finite.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(1))
    .check(Schema.isLessThanOrEqualTo(MAX_IMAGE_UPLOAD_BYTES)),
  altText: Schema.Trim.check(Schema.isMaxLength(300)),
})

export const createImageUploadIntents = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        postId: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
        editing: Schema.optional(Schema.Boolean),
        files: Schema.mutable(Schema.Array(imageIntentInput.mapFields(Struct.omit(["postId"]))))
          .check(Schema.isMinLength(1))
          .check(Schema.isMaxLength(MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const rateLimit = yield* bindingOperation("createImageUploadIntents.rateLimit", () =>
          context.env.UPLOAD_RATE_LIMITER.limit({
            key: `intent:${session.user.id}`,
          }),
        )
        if (!rateLimit.success) {
          return yield* rateLimitedFailure(
            "Too many uploads were started at once. Wait a minute and try again.",
          )
        }

        const draft = yield* bindingOperation("createImageUploadIntents.draft", () =>
          database
            .select({
              id: schema.posts.id,
              type: schema.posts.type,
              authorId: schema.posts.authorId,
              status: schema.posts.status,
            })
            .from(schema.posts)
            .where(and(eq(schema.posts.id, data.postId), ne(schema.posts.status, "deleted")))
            .get(),
        )
        if (
          !draft ||
          draft.type !== "images" ||
          (draft.authorId !== session.user.id &&
            !(data.editing && session.user.role === "admin")) ||
          (!data.editing && draft.status !== "draft")
        ) {
          return yield* notFoundFailure("The image draft was not found.")
        }

        const postAssetCount = yield* bindingOperation(
          "createImageUploadIntents.postAssetCount",
          () =>
            context.database.$client
              .prepare(
                `select count(*) as count from media_assets
       where (json_extract(provider_metadata, '$.postId') = ?
           or json_extract(provider_metadata, '$.editPostId') = ?)
         and owner_id = ? and status not in ('failed', 'deleted')`,
              )
              .bind(data.postId, data.postId, session.user.id)
              .first<{ count: number }>(),
        )
        const firstOrdinal = postAssetCount?.count ?? 0
        if (firstOrdinal + data.files.length > MAX_IMAGES_PER_POST * (data.editing ? 2 : 1)) {
          return yield* invalidInputFailure(
            `A new post can contain at most ${MAX_IMAGES_PER_POST.toString()} images.`,
          )
        }

        const expiresAt = Date.now() + IMAGE_UPLOAD_INTENT_TTL_SECONDS * 1_000
        const intents = data.files.map((file, index) => {
          const assetId = crypto.randomUUID()
          return {
            assetId,
            uploadUrl: `/media/upload/${assetId}`,
            expiresInSeconds: IMAGE_UPLOAD_INTENT_TTL_SECONDS,
            values: {
              id: assetId,
              ownerId: session.user.id,
              kind: "image",
              provider: "r2",
              status: "pending",
              originalFilename: file.filename,
              mimeType: file.mimeType,
              byteSize: file.byteSize,
              altText: file.altText || null,
              providerMetadata: {
                ...(data.editing ? { editPostId: data.postId } : { postId: data.postId }),
                expiresAt,
                ordinal: firstOrdinal + index,
              },
            } satisfies typeof schema.mediaAssets.$inferInsert,
          }
        })
        const [firstIntent, ...remainingIntents] = intents
        if (!firstIntent) return yield* invalidInputFailure("Choose at least one image.")
        return yield* Effect.gen(function* () {
          yield* bindingOperation("createImageUploadIntents.operation", () =>
            database.batch([
              database.insert(schema.mediaAssets).values(firstIntent.values),
              ...remainingIntents.map((intent) =>
                database.insert(schema.mediaAssets).values(intent.values),
              ),
            ]),
          )
          return intents.map(({ assetId, uploadUrl, expiresInSeconds }) => ({
            assetId,
            uploadUrl,
            expiresInSeconds,
          }))
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

const videoIntentInput = Schema.Struct({
  postId: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
  filename: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
  mimeType: Schema.Trim.check(Schema.isPattern(/^video\//)),
  byteSize: Schema.Finite.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(1))
    .check(Schema.isLessThanOrEqualTo(MAX_VIDEO_UPLOAD_BYTES)),
  thumbnailTimestampPct: Schema.Finite.check(
    Schema.isGreaterThanOrEqualTo(MIN_VIDEO_THUMBNAIL_TIMESTAMP_PCT),
  )
    .check(Schema.isLessThanOrEqualTo(MAX_VIDEO_THUMBNAIL_TIMESTAMP_PCT))
    .pipe(Schema.withDecodingDefaultType(Effect.sync(() => DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT))),
})

const readOptionalSecret = Effect.fn("readOptionalSecret")(function* (
  secret: string | SecretsStoreSecret | undefined,
) {
  const value =
    typeof secret === "string"
      ? secret
      : yield* bindingOperation("readOptionalSecret.operation", () => secret?.get())
  return value?.trim() || null
})

export const createVideoUploadIntent = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(videoIntentInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const rateLimit = yield* bindingOperation("createVideoUploadIntent.rateLimit", () =>
          context.env.UPLOAD_RATE_LIMITER.limit({
            key: `intent:${session.user.id}`,
          }),
        )
        if (!rateLimit.success) {
          return yield* rateLimitedFailure(
            "Too many uploads were started at once. Wait a minute and try again.",
          )
        }

        const draft = yield* bindingOperation("createVideoUploadIntent.draft", () =>
          database
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
            .get(),
        )
        if (!draft) return yield* notFoundFailure("The video draft was not found.")

        const existing = yield* bindingOperation("createVideoUploadIntent.existing", () =>
          database
            .select({ id: schema.postMedia.mediaId })
            .from(schema.postMedia)
            .where(eq(schema.postMedia.postId, data.postId))
            .get(),
        )
        if (existing) return yield* conflictFailure("A video draft can contain one video.")

        const assetId = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
        const scheduledDeletion = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
        const [accountId, apiToken] = yield* Effect.all(
          [
            readOptionalSecret(context.env.STREAM_ACCOUNT_ID),
            readOptionalSecret(context.env.STREAM_API_TOKEN),
          ],
          { concurrency: 4 },
        )
        let upload: { id: string; uploadURL: string; protocol: "multipart" | "tus" }

        return yield* Effect.gen(function* () {
          if (accountId && apiToken) {
            const directUpload = yield* createStreamDirectUpload({
              accountId,
              apiToken,
              byteSize: data.byteSize,
              creator: session.user.id,
              filename: data.filename,
              expiresAt,
              scheduledDeletion,
              thumbnailTimestampPct: data.thumbnailTimestampPct,
            })
            upload = {
              id: directUpload.streamUid,
              uploadURL: directUpload.uploadUrl,
              protocol: "tus",
            }
          } else {
            if (data.byteSize >= BASIC_STREAM_UPLOAD_MAX_BYTES) {
              return yield* invalidInputFailure(
                "This video is too large to upload right now. Try a video under 200 MB.",
              )
            }
            const directUpload = yield* bindingOperation(
              "createVideoUploadIntent.directUpload",
              () =>
                context.env.STREAM.createDirectUpload({
                  maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
                  expiry: expiresAt.toISOString(),
                  creator: session.user.id,
                  allowedOrigins: [],
                  requireSignedURLs: false,
                  meta: { assetId, postId: data.postId },
                  scheduledDeletion: scheduledDeletion.toISOString(),
                  thumbnailTimestampPct: data.thumbnailTimestampPct,
                }),
            )
            upload = {
              id: directUpload.id,
              uploadURL: directUpload.uploadURL,
              protocol: "multipart",
            }
          }

          yield* bindingOperation("video-upload.persist", () =>
            database.batch([
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
                providerMetadata: { thumbnailTimestampPct: data.thumbnailTimestampPct },
              }),
              database
                .insert(schema.postMedia)
                .values({ postId: data.postId, mediaId: assetId, ordinal: 0 }),
            ]),
          ).pipe(
            Effect.tapError(() =>
              bindingOperation("video-upload.cleanup", () =>
                context.env.STREAM.video(upload.id).delete(),
              ).pipe(Effect.ignore),
            ),
          )

          return {
            assetId,
            uploadUrl: upload.uploadURL,
            uploadProtocol: upload.protocol,
            streamUid: upload.id,
          }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const getOwnedMediaStatus = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        ids: Schema.mutable(Schema.Array(Schema.String.check(Schema.isUUID())))
          .check(Schema.isMinLength(1))
          .check(Schema.isMaxLength(MAX_IMAGES_PER_POST)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        return yield* bindingOperation("getOwnedMediaStatus.operation", () =>
          ownedMediaStatusQuery(database, session.user.id, data.ids),
        )
      }),
    ),
  )

export const abortMediaUpload = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(Schema.Struct({ id: Schema.String.check(Schema.isUUID()) })))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        yield* userRateLimit(
          context.env.USER_RATE_LIMITER,
          `abort-upload:${session.user.id}`,
          "Too many uploads were cancelled at once. Wait a minute and try again.",
        )
        const asset = yield* bindingOperation("abortMediaUpload.asset", () =>
          database
            .select({ id: schema.mediaAssets.id, status: schema.mediaAssets.status })
            .from(schema.mediaAssets)
            .where(
              and(
                eq(schema.mediaAssets.id, data.id),
                eq(schema.mediaAssets.ownerId, session.user.id),
              ),
            )
            .get(),
        )
        if (!asset) return yield* notFoundFailure("The upload was not found.")
        if (asset.status === "ready" || asset.status === "deleted") {
          return yield* conflictFailure("A finalized upload cannot be aborted.")
        }
        const job = mediaCleanupJob(asset.id)
        return yield* Effect.gen(function* () {
          yield* bindingOperation("abortMediaUpload.operation", () =>
            database
              .insert(schema.outbox)
              .values({ id: job.idempotencyKey, kind: job.type, payload: job })
              .onConflictDoNothing(),
          )
          context.executionContext.waitUntil(context.env.JOBS.send(job))
          return { id: asset.id, status: "cancelled" as const }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const publishPost = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
        version: Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const limited = yield* bindingOperation("publishPost.limited", () =>
          context.env.USER_RATE_LIMITER.limit({
            key: `publish:${session.user.id}`,
          }),
        )
        if (!limited.success)
          return yield* rateLimitedFailure(
            "Too many posts were sent at once. Wait a minute and try again.",
          )
        yield* enforceRecentPostLimit(database, session.user.id)
        const post = yield* bindingOperation("publishPost.post", () =>
          database
            .select(postColumns)
            .from(schema.posts)
            .where(and(eq(schema.posts.id, data.id), eq(schema.posts.authorId, session.user.id)))
            .get(),
        )
        if (!post || post.status !== "draft")
          return yield* notFoundFailure("The draft was not found.")
        if (post.version !== data.version) {
          return yield* conflictFailure(
            "This draft was changed in another tab or device. Reload the page and try again.",
          )
        }

        const media = yield* bindingOperation("publishPost.media", () =>
          database
            .select({
              status: schema.mediaAssets.status,
              kind: schema.mediaAssets.kind,
              streamUid: schema.mediaAssets.streamUid,
            })
            .from(schema.postMedia)
            .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
            .where(
              and(
                eq(schema.postMedia.postId, post.id),
                eq(schema.mediaAssets.ownerId, session.user.id),
              ),
            ),
        )
        if (post.type === "images" && (media.length < 1 || media.length > MAX_IMAGES_PER_POST)) {
          return yield* invalidInputFailure(
            `An image post needs between 1 and ${MAX_IMAGES_PER_POST.toString()} ready images.`,
          )
        }
        if (post.type === "video" && media.length !== 1) {
          return yield* invalidInputFailure("A video post needs one ready video.")
        }
        if (media.some((asset) => asset.status !== "ready")) {
          return yield* conflictFailure("Media is still processing.")
        }
        const video = media.find((asset) => asset.kind === "video")
        const streamUid = video?.streamUid
        return yield* Effect.gen(function* () {
          if (streamUid) {
            yield* bindingOperation("publishPost.keepVideo", () =>
              context.env.STREAM.video(streamUid).update({ scheduledDeletion: null }),
            ).pipe(
              // Stream deletes unposted draft videos after 31 days.
              Effect.catchIf(
                (error) => isStreamNotFoundError(error.cause),
                () => conflictFailure("This video expired. Upload it again."),
              ),
            )
          }

          const invalidate = cacheInvalidationJob(post.id)
          const results = yield* bindingOperation("publishPost.persist", () =>
            database.$client.batch(
              prepareStatements(
                database,
                postPublishStatements(
                  { id: post.id, version: data.version, authorId: session.user.id },
                  invalidate,
                ),
              ),
            ),
          )
          if (results.at(-1)?.meta.changes !== 1) {
            return yield* conflictFailure(
              "This draft was changed in another tab or device. Reload the page and try again.",
            )
          }
          context.executionContext.waitUntil(context.env.JOBS.send(invalidate))
          return { id: post.id, version: data.version + 1 }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const getOwnedPostForEditing = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const post = yield* bindingOperation("getOwnedPostForEditing.post", () =>
          database.select(postColumns).from(schema.posts).where(eq(schema.posts.id, data.id)).get(),
        )
        if (!post || post.status === "deleted")
          return yield* notFoundFailure("The post was not found.")
        if (post.authorId !== session.user.id && session.user.role !== "admin") {
          return yield* notFoundFailure("The post was not found.")
        }
        const tags = yield* bindingOperation("getOwnedPostForEditing.tags", () =>
          database
            .select({ name: schema.tags.displayName })
            .from(schema.postTags)
            .innerJoin(schema.tags, eq(schema.tags.id, schema.postTags.tagId))
            .where(eq(schema.postTags.postId, post.id))
            .orderBy(schema.postTags.ordinal),
        )
        const images = yield* bindingOperation("getOwnedPostForEditing.images", () =>
          database
            .select({
              id: schema.mediaAssets.id,
              filename: schema.mediaAssets.originalFilename,
              altText: schema.mediaAssets.altText,
            })
            .from(schema.postMedia)
            .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
            .where(and(eq(schema.postMedia.postId, post.id), eq(schema.mediaAssets.kind, "image")))
            .orderBy(schema.postMedia.ordinal),
        )
        return { ...post, tags: tags.map(({ name }) => name), images }
      }),
    ),
  )

const updatePostInput = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
  version: Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  title: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(100)),
  textContent: Schema.NullOr(
    Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(MAX_POST_MARKDOWN_LENGTH)),
  ),
  tags: Schema.mutable(Schema.Array(tagSchema))
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(5)),
  visibility: Schema.Literals(["public", "unlisted"]),
  images: Schema.optional(
    Schema.mutable(
      Schema.Array(
        Schema.Struct({
          id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
          altText: Schema.Trim.check(Schema.isMaxLength(300)),
        }),
      ),
    )
      .check(Schema.isMinLength(1))
      .check(Schema.isMaxLength(MAX_IMAGES_PER_POST))
      .check(
        Schema.makeFilter((images) => new Set(images.map(({ id }) => id)).size === images.length),
      ),
  ),
})

export const updatePost = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(updatePostInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        // Each save purges the post and feed caches.
        yield* userRateLimit(
          context.env.USER_RATE_LIMITER,
          `edit-post:${session.user.id}`,
          "You're editing too fast. Wait a minute and try again.",
        )
        const post = yield* bindingOperation("updatePost.post", () =>
          database
            .select({
              id: schema.posts.id,
              type: schema.posts.type,
              status: schema.posts.status,
              authorId: schema.posts.authorId,
            })
            .from(schema.posts)
            .where(eq(schema.posts.id, data.id))
            .get(),
        )
        if (!post || post.status === "deleted")
          return yield* notFoundFailure("The post was not found.")
        if (post.authorId !== session.user.id && session.user.role !== "admin") {
          return yield* forbiddenFailure("You cannot edit this post.")
        }
        if (post.type === "text" && !data.textContent) {
          return yield* invalidInputFailure("Text posts need text content.")
        }

        if (data.images && post.type !== "images") {
          return yield* invalidInputFailure("Only image posts can contain a gallery.")
        }
        const normalizedTags = [...new Set(data.tags.map((tag) => tag.toLocaleLowerCase("en-US")))]
        const tagsWithIds = yield* Effect.forEach(
          normalizedTags,
          (normalized, ordinal) =>
            Effect.gen(function* () {
              return {
                id: yield* tagId(normalized),
                normalized,
                ordinal,
                display:
                  data.tags.find((tag) => tag.toLocaleLowerCase("en-US") === normalized) ??
                  normalized,
              }
            }),
          { concurrency: 4 },
        )
        const invalidate = cacheInvalidationJob(post.id)
        const editStatements = postEditStatements(
          {
            ...data,
            actorId: session.user.id,
            textContent: post.type === "text" ? data.textContent : null,
            tags: tagsWithIds,
          },
          invalidate,
        )
        const statements = prepareStatements(database, [
          ...editStatements,
          ...(post.authorId === session.user.id
            ? []
            : [
                guardedAuditStatement(
                  {
                    id: crypto.randomUUID(),
                    actorId: session.user.id,
                    action: "post.edit",
                    entityType: "post",
                    entityId: post.id,
                    metadata: { authorId: post.authorId },
                  },
                  invalidate.idempotencyKey,
                ),
              ]),
        ])
        return yield* Effect.gen(function* () {
          const results = yield* bindingOperation("updatePost.persist", () =>
            database.$client.batch(statements),
          )
          // The post update is the last edit statement.
          if (results[editStatements.length - 1]?.meta.changes !== 1) {
            return yield* conflictFailure(
              "The post changed or an image is unavailable. Reload the page and try again.",
            )
          }
          // Cleanup jobs for removed images are in the same durable outbox batch.
          context.executionContext.waitUntil(context.env.JOBS.send(invalidate))
          return { id: post.id, version: data.version + 1 }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const deletePost = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
        version: Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        yield* userRateLimit(
          context.env.USER_RATE_LIMITER,
          `delete-post:${session.user.id}`,
          "You're deleting posts too fast. Wait a minute and try again.",
        )
        const post = yield* bindingOperation("deletePost.post", () =>
          database
            .select({ authorId: schema.posts.authorId, status: schema.posts.status })
            .from(schema.posts)
            .where(eq(schema.posts.id, data.id))
            .get(),
        )
        if (!post || post.status === "deleted")
          return yield* notFoundFailure("The post was not found.")
        if (post.authorId !== session.user.id && session.user.role !== "admin") {
          return yield* forbiddenFailure("You cannot delete this post.")
        }
        const media = yield* bindingOperation("deletePost.media", () =>
          database
            .select({ id: schema.postMedia.mediaId })
            .from(schema.postMedia)
            .where(eq(schema.postMedia.postId, data.id)),
        )
        const cleanupJobs = media.map(({ id }) => mediaCleanupJob(id))
        const invalidate = cacheInvalidationJob(data.id)
        const statements = prepareStatements(
          database,
          postDeleteStatements(
            {
              id: data.id,
              version: data.version,
              actorId: session.user.id,
              mediaIds: media.map(({ id }) => id),
              audit:
                post.authorId === session.user.id
                  ? null
                  : {
                      id: crypto.randomUUID(),
                      actorId: session.user.id,
                      action: "post.delete",
                      entityType: "post",
                      entityId: data.id,
                      metadata: { authorId: post.authorId },
                    },
            },
            invalidate,
          ),
        )
        return yield* Effect.gen(function* () {
          const results = yield* bindingOperation("deletePost.persist", () =>
            database.$client.batch(statements),
          )
          if (results.at(-1)?.meta.changes !== 1) {
            return yield* conflictFailure(
              "This post was changed in another tab or device. Reload the page to get the latest version.",
            )
          }
          context.executionContext.waitUntil(
            Promise.all([...cleanupJobs, invalidate].map((job) => context.env.JOBS.send(job))).then(
              () => undefined,
            ),
          )
          return { id: data.id }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )
