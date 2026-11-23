import { describe, expect, mock, test } from "bun:test"

import { Effect, Result } from "effect"

import { resolveVideoPlaybackUrl, signStreamDeliveryUrl } from "./video-playback"

function videoClient({
  requireSignedURLs = false,
  allowedOrigins = [],
  dashPlaybackUrl = "https://customer-example.cloudflarestream.com/video-id/manifest/video.mpd",
  hlsPlaybackUrl = "https://customer-example.cloudflarestream.com/video-id/manifest/video.m3u8",
}: {
  requireSignedURLs?: boolean
  allowedOrigins?: string[]
  dashPlaybackUrl?: string
  hlsPlaybackUrl?: string
} = {}) {
  return {
    details: () =>
      Promise.resolve({
        id: "video-id",
        requireSignedURLs,
        allowedOrigins,
        dashPlaybackUrl,
        hlsPlaybackUrl,
      }),
    update: mock(() =>
      Promise.resolve({
        id: "video-id",
        requireSignedURLs,
        allowedOrigins: [],
        dashPlaybackUrl,
        hlsPlaybackUrl,
      }),
    ),
    generateToken: mock(() => Promise.resolve("signed.token-value")),
  }
}

describe("video playback URLs", () => {
  test("accepts unrestricted Cloudflare Stream DASH delivery URLs", async () => {
    const url = "https://customer-example.cloudflarestream.com/video-id/manifest/video.mpd"
    const client = videoClient({ dashPlaybackUrl: url })

    expect(await Effect.runPromise(resolveVideoPlaybackUrl(client))).toBe(url)
    expect(client.update).not.toHaveBeenCalled()
    expect(client.generateToken).not.toHaveBeenCalled()
  })

  test("signs playback for a video that requires signed URLs", async () => {
    // Moderation and author bans make Stream reject the plain video ID URL.
    const client = videoClient({ requireSignedURLs: true })

    expect(await Effect.runPromise(resolveVideoPlaybackUrl(client))).toBe(
      "https://customer-example.cloudflarestream.com/signed.token-value/manifest/video.mpd",
    )
    expect(await Effect.runPromise(resolveVideoPlaybackUrl(client, "hls"))).toBe(
      "https://customer-example.cloudflarestream.com/signed.token-value/manifest/video.m3u8",
    )
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
      Effect.result(
        resolveVideoPlaybackUrl(videoClient({ dashPlaybackUrl: "https://example.com/video.mpd" })),
      ),
    )

    expect(Result.isFailure(result)).toBeTrue()
    if (Result.isFailure(result)) expect(result.failure.operation).toBe("validate")
  })

  test("maps provider failures to a typed playback error", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        resolveVideoPlaybackUrl({
          details: () => Promise.reject(new Error("provider unavailable")),
          update: () => Promise.reject(new Error("unexpected update")),
          generateToken: () => Promise.reject(new Error("unexpected token")),
        }),
      ),
    )

    expect(Result.isFailure(result)).toBeTrue()
    if (Result.isFailure(result)) expect(result.failure.operation).toBe("details")
  })

  test("maps token failures to a typed playback error", async () => {
    const client = videoClient({ requireSignedURLs: true })
    client.generateToken.mockImplementation(() => Promise.reject(new Error("no signing key")))
    const result = await Effect.runPromise(Effect.result(resolveVideoPlaybackUrl(client)))

    expect(Result.isFailure(result)).toBeTrue()
    if (Result.isFailure(result)) expect(result.failure.operation).toBe("sign")
  })
})

describe("signed Stream delivery URLs", () => {
  test("replaces the video ID path segment with the token", () => {
    expect(
      signStreamDeliveryUrl(
        "https://customer-example.cloudflarestream.com/video-id/thumbnails/thumbnail.jpg?time=2s",
        "video-id",
        "signed.token-value",
      ),
    ).toBe(
      "https://customer-example.cloudflarestream.com/signed.token-value/thumbnails/thumbnail.jpg?time=2s",
    )
  })

  test("rejects a URL that does not start with the video ID", () => {
    expect(
      signStreamDeliveryUrl(
        "https://customer-example.cloudflarestream.com/other-id/manifest/video.mpd",
        "video-id",
        "signed.token-value",
      ),
    ).toBeNull()
  })
})
