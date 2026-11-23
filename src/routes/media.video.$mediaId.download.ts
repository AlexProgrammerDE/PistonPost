import { createFileRoute } from "@tanstack/react-router"
import { Effect, Result, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import type { AppRequestContext } from "@/server"
import { cacheTagHeader } from "@/server/cache-tags"
import { logError } from "@/server/error-log"
import { readOptionalSecret } from "@/server/optional-secret"
import { getDeliverableVideo } from "@/server/video-delivery"
import {
  readyVideoDownloadUrl,
  refreshVideoDownload,
  signVideoDownloadUrl,
  storeRefreshedVideoDownload,
} from "@/server/video-download"

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
      Effect.runPromise(
        storeRefreshedVideoDownload(
          createD1Database(context.env.DB),
          mediaId.success,
          metadata,
        ).pipe(
          Effect.catchCause(() =>
            Effect.sync(() => {
              logError("video-download.store", { mediaId: mediaId.success })
            }),
          ),
        ),
      ),
    )
  }
  if (!downloadUrl) return unavailableDownload()

  // Only moderated, banned, or draft media can require signed URLs, and only its owner or an
  // administrator reaches this point. Public media keeps the stored, cacheable URL.
  if (video.audience !== "public") {
    const streamVideo = context.env.STREAM.video(video.streamUid)
    const signed = await Effect.runPromise(
      Effect.result(
        signVideoDownloadUrl({
          downloadUrl,
          streamUid: video.streamUid,
          details: () => streamVideo.details(),
          credentials: Effect.all(
            {
              accountId: readOptionalSecret(context.env.STREAM_ACCOUNT_ID),
              apiToken: readOptionalSecret(context.env.STREAM_API_TOKEN),
            },
            { concurrency: 2 },
          ),
        }),
      ),
      { signal: request.signal },
    )
    if (Result.isFailure(signed)) {
      logError("video-download.sign", {
        mediaId: mediaId.success,
        operation: signed.failure.operation,
        status: signed.failure.status,
      })
      return new Response("Video download unavailable", {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      })
    }
    downloadUrl = signed.success
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: downloadUrl,
      "Cache-Control": video.publiclyCacheable ? "public, max-age=3600" : "private, no-store",
      ...(video.publiclyCacheable
        ? {
            "Cache-Tag": cacheTagHeader(video.cacheTags),
          }
        : {}),
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/download")({
  server: { handlers: { GET: videoDownload, HEAD: videoDownload } },
})
