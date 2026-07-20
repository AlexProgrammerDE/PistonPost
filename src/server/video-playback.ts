import { Effect, Schema } from "effect"

type VideoPlaybackClient = {
  details(): Promise<Pick<StreamVideo, "allowedOrigins" | "dashPlaybackUrl" | "hlsPlaybackUrl">>
  update(
    params: Pick<StreamUpdateVideoParams, "allowedOrigins">,
  ): Promise<Pick<StreamVideo, "allowedOrigins" | "dashPlaybackUrl" | "hlsPlaybackUrl">>
}

export type VideoPlaybackFormat = "dash" | "hls"

export class VideoPlaybackError extends Schema.TaggedError<VideoPlaybackError>()(
  "VideoPlaybackError",
  {
    operation: Schema.Literal("details", "update", "validate"),
    cause: Schema.Defect,
  },
) {}

function cloudflarePlaybackUrl(value: string) {
  if (!URL.canParse(value)) return null
  const url = new URL(value)
  if (url.protocol !== "https:") return null
  if (
    !url.hostname.endsWith(".cloudflarestream.com") &&
    !url.hostname.endsWith(".videodelivery.net")
  ) {
    return null
  }
  return url.toString()
}

export const resolveVideoPlaybackUrl = Effect.fn("resolveVideoPlaybackUrl")(function* (
  client: VideoPlaybackClient,
  format: VideoPlaybackFormat = "dash",
) {
  let video = yield* Effect.tryPromise({
    try: () => client.details(),
    catch: (cause) => new VideoPlaybackError({ operation: "details", cause }),
  })

  if (video.allowedOrigins.length > 0) {
    video = yield* Effect.tryPromise({
      try: () => client.update({ allowedOrigins: [] }),
      catch: (cause) => new VideoPlaybackError({ operation: "update", cause }),
    })
  }

  const playbackUrl = cloudflarePlaybackUrl(
    format === "hls" ? video.hlsPlaybackUrl : video.dashPlaybackUrl,
  )
  if (!playbackUrl) {
    return yield* new VideoPlaybackError({
      operation: "validate",
      cause: new Error(`Cloudflare returned an invalid ${format.toUpperCase()} playback URL.`),
    })
  }
  return playbackUrl
})
