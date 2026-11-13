import { createFileRoute } from "@tanstack/react-router"
import { Effect, Schema, Result } from "effect"

import type { AppRequestContext } from "@/server"
import { getDeliverableVideo } from "@/server/video-delivery"
import { resolveVideoPlaybackUrl } from "@/server/video-playback"

const playbackFormatSchema = Schema.Literals(["dash", "hls"])

async function videoManifest({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { mediaId: string }
}) {
  const mediaId = Schema.decodeResult(Schema.String.check(Schema.isUUID()), {
    errors: "all",
  })(params.mediaId)
  if (!Result.isSuccess(mediaId)) return new Response("Not found", { status: 404 })

  const format = Schema.decodeUnknownResult(playbackFormatSchema, { errors: "all" })(
    new URL(request.url).searchParams.get("format") ?? "dash",
  )
  if (!Result.isSuccess(format)) return new Response("Invalid playback format", { status: 400 })

  const video = await getDeliverableVideo(request, context, mediaId.success)
  if (!video) return new Response("Not found", { status: 404 })

  const playbackUrl = await Effect.runPromise(
    resolveVideoPlaybackUrl(context.env.STREAM.video(video.streamUid), format.success).pipe(
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
