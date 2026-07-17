import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { fitMediaDimensions, SOCIAL_MEDIA_IMAGE_MAX_SIZE } from "@/lib/media-image"
import type { AppRequestContext } from "@/server"
import { getDeliverableVideo } from "@/server/video-delivery"

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

  const details = await context.env.STREAM.video(video.streamUid).details()
  const thumbnail = new URL(details.thumbnail)
  const dimensions = fitMediaDimensions(
    video,
    SOCIAL_MEDIA_IMAGE_MAX_SIZE,
    SOCIAL_MEDIA_IMAGE_MAX_SIZE,
  ) ?? { width: SOCIAL_MEDIA_IMAGE_MAX_SIZE, height: SOCIAL_MEDIA_IMAGE_MAX_SIZE }
  thumbnail.searchParams.set("width", dimensions.width.toString())
  thumbnail.searchParams.set("height", dimensions.height.toString())
  thumbnail.searchParams.set("fit", "clip")

  return new Response(null, {
    status: 302,
    headers: {
      Location: thumbnail.toString(),
      "Cache-Control": video.publiclyCacheable ? "public, max-age=3600" : "private, no-store",
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/thumbnail")({
  server: { handlers: { GET: videoThumbnail, HEAD: videoThumbnail } },
})
