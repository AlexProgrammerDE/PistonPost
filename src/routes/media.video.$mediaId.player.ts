import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import type { AppRequestContext } from "@/server"
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

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://iframe.videodelivery.net/${video.streamUid}`,
      "Cache-Control": video.publiclyCacheable ? "public, max-age=3600" : "private, no-store",
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/player")({
  server: { handlers: { GET: videoPlayer } },
})
