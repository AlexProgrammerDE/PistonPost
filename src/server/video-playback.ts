import { Effect, Schema } from "effect"

type PlaybackDetails = Pick<
  StreamVideo,
  "id" | "allowedOrigins" | "dashPlaybackUrl" | "hlsPlaybackUrl" | "requireSignedURLs"
>

type VideoPlaybackClient = {
  details(): Promise<PlaybackDetails>
  update(params: Pick<StreamUpdateVideoParams, "allowedOrigins">): Promise<PlaybackDetails>
  generateToken(): Promise<string>
}

export type VideoPlaybackFormat = "dash" | "hls"

export class VideoPlaybackError extends Schema.TaggedError<
  VideoPlaybackError,
  { readonly brand: unique symbol }
>()("VideoPlaybackError", {
  operation: Schema.Literals(["details", "update", "sign", "validate"]),
  cause: Schema.Defect(),
}) {}

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

/**
 * Puts a signed token in place of the video ID, which Stream requires for every manifest,
 * thumbnail, and segment of a video with `requireSignedURLs`.
 */
export function signStreamDeliveryUrl(value: string, videoId: string, token: string) {
  const url = new URL(value)
  const [, firstSegment, ...rest] = url.pathname.split("/")
  if (firstSegment !== videoId) return null
  url.pathname = ["", token, ...rest].join("/")
  return url.toString()
}

export const resolveVideoPlaybackUrl = Effect.fn("resolveVideoPlaybackUrl")(function* (
  client: VideoPlaybackClient,
  format: VideoPlaybackFormat = "dash",
) {
  let video = yield* Effect.tryPromise({
    try: () => client.details(),
    catch: (cause) => VideoPlaybackError.make({ operation: "details", cause }),
  })

  if (video.allowedOrigins.length > 0) {
    video = yield* Effect.tryPromise({
      try: () => client.update({ allowedOrigins: [] }),
      catch: (cause) => VideoPlaybackError.make({ operation: "update", cause }),
    })
  }

  let playbackUrl = cloudflarePlaybackUrl(
    format === "hls" ? video.hlsPlaybackUrl : video.dashPlaybackUrl,
  )
  // Moderation and author bans require signed URLs. The owner and administrators keep playback.
  if (playbackUrl && video.requireSignedURLs) {
    const token = yield* Effect.tryPromise({
      try: () => client.generateToken(),
      catch: (cause) => VideoPlaybackError.make({ operation: "sign", cause }),
    })
    playbackUrl = signStreamDeliveryUrl(playbackUrl, video.id, token)
  }
  if (!playbackUrl) {
    return yield* VideoPlaybackError.make({
      operation: "validate",
      cause: new Error(`Cloudflare returned an invalid ${format.toUpperCase()} playback URL.`),
    })
  }
  return playbackUrl
})
