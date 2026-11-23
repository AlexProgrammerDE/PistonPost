import { createFileRoute } from "@tanstack/react-router"
import { Schema, SchemaGetter, Effect, SchemaIssue, Result } from "effect"

import { fitMediaDimensions } from "@/lib/media-image"
import { createStreamThumbnailUrl, SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE } from "@/lib/video-thumbnail"
import type { AppRequestContext } from "@/server"
import { cacheTagHeader } from "@/server/cache-tags"
import { getDeliverableVideo } from "@/server/video-delivery"
import { resolveVideoThumbnailSource } from "@/server/video-playback"

const thumbnailSearchSchema = Schema.Struct({
  time: Schema.optional(
    Schema.Unknown.pipe(
      Schema.decodeTo(Schema.Finite, {
        decode: SchemaGetter.transformEffect((value) =>
          Effect.try({
            try: () => Number(value),
            catch: () => new SchemaIssue.InvalidValue({ message: "Invalid number" }),
          }),
        ),
        encode: SchemaGetter.passthrough(),
      }),
    )
      .check(Schema.isFinite())
      .check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  width: Schema.optional(
    Schema.Unknown.pipe(
      Schema.decodeTo(Schema.Finite, {
        decode: SchemaGetter.transformEffect((value) =>
          Effect.try({
            try: () => Number(value),
            catch: () => new SchemaIssue.InvalidValue({ message: "Invalid number" }),
          }),
        ),
        encode: SchemaGetter.passthrough(),
      }),
    )
      .check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(2))
      .check(Schema.isLessThanOrEqualTo(SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE)),
  ),
  height: Schema.optional(
    Schema.Unknown.pipe(
      Schema.decodeTo(Schema.Finite, {
        decode: SchemaGetter.transformEffect((value) =>
          Effect.try({
            try: () => Number(value),
            catch: () => new SchemaIssue.InvalidValue({ message: "Invalid number" }),
          }),
        ),
        encode: SchemaGetter.passthrough(),
      }),
    )
      .check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(2))
      .check(Schema.isLessThanOrEqualTo(SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE)),
  ),
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
  const mediaId = Schema.decodeResult(Schema.String.check(Schema.isUUID()), {
    errors: "all",
  })(params.mediaId)
  if (!Result.isSuccess(mediaId)) return new Response("Not found", { status: 404 })

  const video = await getDeliverableVideo(request, context, mediaId.success)
  if (!video) return new Response("Not found", { status: 404 })

  const requestUrl = new URL(request.url)
  const search = Schema.decodeResult(thumbnailSearchSchema, { errors: "all" })({
    time: requestUrl.searchParams.get("time") ?? undefined,
    width: requestUrl.searchParams.get("width") ?? undefined,
    height: requestUrl.searchParams.get("height") ?? undefined,
  })
  if (!Result.isSuccess(search)) return new Response("Invalid thumbnail request", { status: 400 })

  const thumbnailSource = await Effect.runPromise(
    resolveVideoThumbnailSource(context.env.STREAM.video(video.streamUid)).pipe(
      Effect.match({
        onFailure: () => null,
        onSuccess: (resolved) => resolved,
      }),
    ),
  )
  if (!thumbnailSource) return new Response("Thumbnail unavailable", { status: 502 })
  const defaultDimensions = fitMediaDimensions(
    video,
    SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE,
    SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE,
  ) ?? { width: SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE, height: SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE }
  const thumbnail = createStreamThumbnailUrl({
    source: thumbnailSource.source,
    durationSeconds: thumbnailSource.durationSeconds,
    timestampPct: thumbnailSource.timestampPct,
    timeSeconds: search.success.time,
    width: search.success.width ?? defaultDimensions.width,
    height: search.success.height ?? defaultDimensions.height,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: thumbnail.toString(),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": video.publiclyCacheable ? "public, max-age=3600" : "private, no-store",
      ...(video.publiclyCacheable
        ? {
            "Cache-Tag": cacheTagHeader(video.cacheTags),
          }
        : {}),
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/thumbnail")({
  server: { handlers: { GET: videoThumbnail, HEAD: videoThumbnail } },
})
