import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { z } from "zod"

import type { AppRequestContext } from "@/server"
import { getDeliverableVideo } from "@/server/video-delivery"
import { resolveVideoPlaybackUrl } from "@/server/video-playback"

const playbackFormatSchema = z.enum(["dash", "hls"])

async function videoManifest({
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

  const format = playbackFormatSchema.safeParse(
    new URL(request.url).searchParams.get("format") ?? "dash",
  )
  if (!format.success) return new Response("Invalid playback format", { status: 400 })

  const video = await getDeliverableVideo(request, context, mediaId.data)
  if (!video) return new Response("Not found", { status: 404 })

  const playbackUrl = await Effect.runPromise(
    resolveVideoPlaybackUrl(context.env.STREAM.video(video.streamUid), format.data).pipe(
      Effect.match({
        onFailure: () => null,
        onSuccess: (url) => url,
      }),
    ),
  )
  if (!playbackUrl) return new Response("Playback unavailable", { status: 502 })

  return new Response(null, {
    status: 302,
    headers: {
      Location: playbackUrl,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, no-store",
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/manifest")({
  server: { handlers: { GET: videoManifest, HEAD: videoManifest } },
})
