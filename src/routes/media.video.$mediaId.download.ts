import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { Effect, Either } from "effect"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import type { AppRequestContext } from "@/server"
import { getDeliverableVideo } from "@/server/video-delivery"
import { readyVideoDownloadUrl, refreshVideoDownload } from "@/server/video-download"

function unavailableDownload() {
  return new Response("Video download is still processing", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "60" },
  })
}

async function videoDownload({
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

  let metadata = video.providerMetadata
  let downloadUrl = readyVideoDownloadUrl(metadata)
  if (!downloadUrl) {
    const refreshed = await Effect.runPromise(
      Effect.either(
        refreshVideoDownload(context.env.STREAM.video(video.streamUid).downloads, metadata),
      ),
    )
    if (Either.isLeft(refreshed)) return unavailableDownload()
    metadata = refreshed.right
    downloadUrl = readyVideoDownloadUrl(metadata)
    context.executionContext.waitUntil(
      createD1Database(context.env.DB)
        .update(schema.mediaAssets)
        .set({ providerMetadata: metadata })
        .where(eq(schema.mediaAssets.id, mediaId.data)),
    )
  }
  if (!downloadUrl) return unavailableDownload()

  return new Response(null, {
    status: 302,
    headers: {
      Location: downloadUrl,
      "Cache-Control": video.publiclyCacheable ? "public, max-age=3600" : "private, no-store",
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/download")({
  server: { handlers: { GET: videoDownload, HEAD: videoDownload } },
})
