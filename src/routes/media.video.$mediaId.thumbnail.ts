import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { fitMediaDimensions, SOCIAL_MEDIA_IMAGE_MAX_SIZE } from "@/lib/media-image"
import { createStreamThumbnailUrl } from "@/lib/video-thumbnail"
import type { AppRequestContext } from "@/server"
import { cacheTagHeader, mediaCacheTag, ownerCacheTag, postCacheTag } from "@/server/cache-tags"
import { getDeliverableVideo } from "@/server/video-delivery"

const thumbnailSearchSchema = z.object({
  time: z.coerce.number().finite().min(0).optional(),
  width: z.coerce.number().int().min(2).max(SOCIAL_MEDIA_IMAGE_MAX_SIZE).optional(),
  height: z.coerce.number().int().min(2).max(SOCIAL_MEDIA_IMAGE_MAX_SIZE).optional(),
})

async function videoThumbnail({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { mediaId: string }
}) {
  const mediaId = z.string().uuid().safeParse(params.mediaId)
  if (!mediaId.success) return new Response("Not found", { status: 404 })

  const video = await getDeliverableVideo(request, context, mediaId.data)
  if (!video) return new Response("Not found", { status: 404 })

  const requestUrl = new URL(request.url)
  const search = thumbnailSearchSchema.safeParse({
    time: requestUrl.searchParams.get("time") ?? undefined,
    width: requestUrl.searchParams.get("width") ?? undefined,
    height: requestUrl.searchParams.get("height") ?? undefined,
  })
  if (!search.success) return new Response("Invalid thumbnail request", { status: 400 })

  const details = await context.env.STREAM.video(video.streamUid).details()
  const defaultDimensions = fitMediaDimensions(
    video,
    SOCIAL_MEDIA_IMAGE_MAX_SIZE,
    SOCIAL_MEDIA_IMAGE_MAX_SIZE,
  ) ?? { width: SOCIAL_MEDIA_IMAGE_MAX_SIZE, height: SOCIAL_MEDIA_IMAGE_MAX_SIZE }
  const thumbnail = createStreamThumbnailUrl({
    source: details.thumbnail,
    durationSeconds: details.duration,
    timestampPct: details.thumbnailTimestampPct,
    timeSeconds: search.data.time,
    width: search.data.width ?? defaultDimensions.width,
    height: search.data.height ?? defaultDimensions.height,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: thumbnail.toString(),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": video.publiclyCacheable ? "public, max-age=3600" : "private, no-store",
      ...(video.publiclyCacheable
        ? {
            "Cache-Tag": cacheTagHeader([
              mediaCacheTag(mediaId.data),
              ...(video.ownerId ? [ownerCacheTag(video.ownerId)] : []),
              ...(video.postId ? [postCacheTag(video.postId)] : []),
            ]),
          }
        : {}),
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/thumbnail")({
  server: { handlers: { GET: videoThumbnail, HEAD: videoThumbnail } },
})
