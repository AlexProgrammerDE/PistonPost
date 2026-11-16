import { Schema } from "effect"

import { FEED_CACHE_TAG, isCacheTag, postCacheTag, SITEMAP_CACHE_TAG } from "./cache-tags"

export const mediaCleanupJobSchema = Schema.Struct({
  type: Schema.Literal("media.cleanup"),
  idempotencyKey: Schema.String.check(Schema.isMinLength(1)),
  mediaId: Schema.String.check(Schema.isUUID()),
})

export const cacheInvalidationJobSchema = Schema.Struct({
  type: Schema.Literal("cache.invalidate"),
  idempotencyKey: Schema.String.check(Schema.isMinLength(1)),
  tags: Schema.mutable(
    Schema.Array(Schema.String.check(Schema.makeFilter((value) => isCacheTag(value)))),
  )
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(100)),
})

/** Re-applies Stream playback access from the post's current moderation state. */
export const videoAccessJobSchema = Schema.Struct({
  type: Schema.Literal("media.video-access"),
  idempotencyKey: Schema.String.check(Schema.isMinLength(1)),
  postId: Schema.String.check(Schema.isMinLength(1)),
})

export const internalJobSchema = Schema.Union([
  mediaCleanupJobSchema,
  cacheInvalidationJobSchema,
  videoAccessJobSchema,
])

export type InternalJob = (typeof internalJobSchema)["Type"]

export function mediaCleanupJob(mediaId: string): Extract<InternalJob, { type: "media.cleanup" }> {
  return {
    type: "media.cleanup",
    idempotencyKey: `media.cleanup:${mediaId}`,
    mediaId,
  }
}

export function videoAccessJob(
  postId: string,
  eventId: string,
): Extract<InternalJob, { type: "media.video-access" }> {
  return {
    type: "media.video-access",
    idempotencyKey: `media.video-access:${postId}:${eventId}`,
    postId,
  }
}

export function cacheInvalidationTagsJob(
  scope: string,
  tags: ReadonlyArray<string>,
  idempotencyKey = `cache.invalidate:${scope}:${crypto.randomUUID()}`,
): InternalJob {
  return Schema.decodeSync(cacheInvalidationJobSchema, { errors: "all" })({
    type: "cache.invalidate",
    idempotencyKey,
    tags: [...new Set(tags)],
  })
}

export function cacheInvalidationJob(postId: string): InternalJob {
  return cacheInvalidationTagsJob(`post:${postId}`, [
    postCacheTag(postId),
    FEED_CACHE_TAG,
    SITEMAP_CACHE_TAG,
  ])
}
