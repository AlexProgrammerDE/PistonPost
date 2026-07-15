import { z } from "zod"

export const mediaCleanupJobSchema = z.object({
  type: z.literal("media.cleanup"),
  idempotencyKey: z.string().min(1),
  mediaId: z.string().uuid(),
})

export const cacheInvalidationJobSchema = z.object({
  type: z.literal("cache.invalidate"),
  idempotencyKey: z.string().min(1),
  paths: z.array(z.string().startsWith("/")).min(1).max(12),
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

export function cacheInvalidationJob(postId: string, authorUsername?: string): InternalJob {
  return {
    type: "cache.invalidate",
    idempotencyKey: `cache.invalidate:${postId}:${crypto.randomUUID()}`,
    paths: ["/", `/post/${postId}`, ...(authorUsername ? [`/user/${authorUsername}`] : [])],
  }
}
