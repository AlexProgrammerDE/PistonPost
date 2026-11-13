import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { Effect, Result, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import type { AppRequestContext } from "@/server"
import { cacheTagHeader, mediaCacheTag, ownerCacheTag, postCacheTag } from "@/server/cache-tags"
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
  const mediaId = Schema.decodeResult(Schema.String.check(Schema.isUUID()), {
    errors: "all",
  })(params.mediaId)
  if (!Result.isSuccess(mediaId)) return new Response("Not found", { status: 404 })

  const video = await getDeliverableVideo(request, context, mediaId.success)
  if (!video) return new Response("Not found", { status: 404 })

  let metadata = video.providerMetadata
  let downloadUrl = readyVideoDownloadUrl(metadata)
  if (!downloadUrl) {
    const refreshed = await Effect.runPromise(
      Effect.result(
        refreshVideoDownload(context.env.STREAM.video(video.streamUid).downloads, metadata),
      ),
    )
    if (Result.isFailure(refreshed)) return unavailableDownload()
    metadata = refreshed.success
    downloadUrl = readyVideoDownloadUrl(metadata)
    context.executionContext.waitUntil(
      createD1Database(context.env.DB)
        .update(schema.mediaAssets)
        .set({ providerMetadata: metadata })
        .where(eq(schema.mediaAssets.id, mediaId.success)),
    )
  }
  if (!downloadUrl) return unavailableDownload()

  return new Response(null, {
    status: 302,
    headers: {
      Location: downloadUrl,
      "Cache-Control": video.publiclyCacheable ? "public, max-age=3600" : "private, no-store",
      ...(video.publiclyCacheable
        ? {
            "Cache-Tag": cacheTagHeader([
              mediaCacheTag(mediaId.success),
              ...(video.ownerId ? [ownerCacheTag(video.ownerId)] : []),
              ...(video.postId ? [postCacheTag(video.postId)] : []),
            ]),
          }
        : {}),
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/download")({
  server: { handlers: { GET: videoDownload, HEAD: videoDownload } },
})
