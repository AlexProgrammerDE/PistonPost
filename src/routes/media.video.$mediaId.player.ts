import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { VIDEO_THUMBNAIL_CACHE_VERSION } from "@/lib/video-thumbnail"
import type { AppRequestContext } from "@/server"
import { cacheTagHeader, mediaCacheTag, ownerCacheTag, postCacheTag } from "@/server/cache-tags"
import { getDeliverableVideo } from "@/server/video-delivery"

async function videoPlayer({
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
  const player = new URL(`https://iframe.videodelivery.net/${video.streamUid}`)
  player.searchParams.set(
    "poster",
    new URL(
      `/media/video/${mediaId.data}/thumbnail?v=${VIDEO_THUMBNAIL_CACHE_VERSION.toString()}`,
      context.runtime.config.PUBLIC_APP_URL,
    ).toString(),
  )

  return new Response(null, {
    status: 302,
    headers: {
      Location: player.toString(),
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

export const Route = createFileRoute("/media/video/$mediaId/player")({
  server: { handlers: { GET: videoPlayer } },
})
