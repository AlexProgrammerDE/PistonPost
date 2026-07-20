import { z } from "zod"

import { FEED_CACHE_TAG, isCacheTag, postCacheTag, SITEMAP_CACHE_TAG } from "./cache-tags"

export const mediaCleanupJobSchema = z.object({
  type: z.literal("media.cleanup"),
  idempotencyKey: z.string().min(1),
  mediaId: z.string().uuid(),
})

export const cacheInvalidationJobSchema = z.object({
  type: z.literal("cache.invalidate"),
  idempotencyKey: z.string().min(1),
  tags: z.array(z.string().refine(isCacheTag)).min(1).max(100),
})

export const internalJobSchema = z.discriminatedUnion("type", [
  mediaCleanupJobSchema,
  cacheInvalidationJobSchema,
])

export type InternalJob = z.infer<typeof internalJobSchema>

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
  return cacheInvalidationJobSchema.parse({
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
