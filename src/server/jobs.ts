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

export const internalJobSchema = Schema.Union([mediaCleanupJobSchema, cacheInvalidationJobSchema])

export type InternalJob = (typeof internalJobSchema)["Type"]

export function mediaCleanupJob(mediaId: string): InternalJob {
  return {
    type: "media.cleanup",
    idempotencyKey: `media.cleanup:${mediaId}`,
    mediaId,
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
