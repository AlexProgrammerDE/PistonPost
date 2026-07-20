import { describe, expect, mock, test } from "bun:test"

import { Effect, Either } from "effect"

import { resolveVideoPlaybackUrl } from "./video-playback"

function videoClient({
  allowedOrigins = [],
  dashPlaybackUrl = "https://customer-example.cloudflarestream.com/video-id/manifest/video.mpd",
  hlsPlaybackUrl = "https://customer-example.cloudflarestream.com/video-id/manifest/video.m3u8",
}: {
  allowedOrigins?: Array<string>
  dashPlaybackUrl?: string
  hlsPlaybackUrl?: string
} = {}) {
  return {
    details: async () => ({ allowedOrigins, dashPlaybackUrl, hlsPlaybackUrl }),
    update: mock(async () => ({ allowedOrigins: [], dashPlaybackUrl, hlsPlaybackUrl })),
  }
}

describe("video playback URLs", () => {
  test("accepts unrestricted Cloudflare Stream DASH delivery URLs", async () => {
    const url = "https://customer-example.cloudflarestream.com/video-id/manifest/video.mpd"
    const client = videoClient({ dashPlaybackUrl: url })

    expect(await Effect.runPromise(resolveVideoPlaybackUrl(client))).toBe(url)
    expect(client.update).not.toHaveBeenCalled()
  })

  test("selects native HLS delivery when requested for AirPlay", async () => {
    const url = "https://customer-example.cloudflarestream.com/video-id/manifest/video.m3u8"

    expect(
      await Effect.runPromise(resolveVideoPlaybackUrl(videoClient({ hlsPlaybackUrl: url }), "hls")),
    ).toBe(url)
  })

  test("clears origin restrictions so Cast receivers can load older videos", async () => {
    const url = "https://customer-example.cloudflarestream.com/video-id/manifest/video.mpd"
    const client = videoClient({
      allowedOrigins: ["post.pistonmaster.net"],
      dashPlaybackUrl: url,
    })

    expect(await Effect.runPromise(resolveVideoPlaybackUrl(client))).toBe(url)
    expect(client.update).toHaveBeenCalledWith({ allowedOrigins: [] })
  })

  test("rejects playback URLs outside Cloudflare delivery", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        resolveVideoPlaybackUrl(videoClient({ dashPlaybackUrl: "https://example.com/video.mpd" })),
      ),
    )

    expect(Either.isLeft(result)).toBeTrue()
    if (Either.isLeft(result)) expect(result.left.operation).toBe("validate")
  })

  test("maps provider failures to a typed playback error", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        resolveVideoPlaybackUrl({
          details: async () => {
            throw new Error("provider unavailable")
          },
          update: async () => {
            throw new Error("unexpected update")
          },
        }),
      ),
    )

    expect(Either.isLeft(result)).toBeTrue()
    if (Either.isLeft(result)) expect(result.left.operation).toBe("details")
  })
})
