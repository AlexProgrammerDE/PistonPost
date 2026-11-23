import { describe, expect, mock, test } from "bun:test"

import { Effect, Result } from "effect"

import {
  resolveVideoPlaybackUrl,
  resolveVideoThumbnailSource,
  signStreamDeliveryUrl,
} from "./video-playback"

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

function thumbnailClient({
  requireSignedURLs = false,
  thumbnail = "https://customer-example.cloudflarestream.com/video-id/thumbnails/thumbnail.jpg",
}: { requireSignedURLs?: boolean; thumbnail?: string } = {}) {
  return {
    details: mock(() =>
      Promise.resolve({
        id: "video-id",
        thumbnail,
        requireSignedURLs,
        duration: 12,
        thumbnailTimestampPct: 0.25,
      }),
    ),
    generateToken: mock(() => Promise.resolve("signed.token-value")),
  }
}

function thumbnailFailure(client: ReturnType<typeof thumbnailClient>) {
  return Effect.runPromise(Effect.result(resolveVideoThumbnailSource(client))).then((result) =>
    Result.isFailure(result) ? result.failure.operation : null,
  )
}

describe("video thumbnail sources", () => {
  test("returns the plain thumbnail with its timing details", async () => {
    const client = thumbnailClient()

    expect(await Effect.runPromise(resolveVideoThumbnailSource(client))).toEqual({
      source: "https://customer-example.cloudflarestream.com/video-id/thumbnails/thumbnail.jpg",
      durationSeconds: 12,
      timestampPct: 0.25,
    })
    expect(client.generateToken).not.toHaveBeenCalled()
  })

  test("signs the thumbnail of a video that requires signed URLs", async () => {
    const resolved = await Effect.runPromise(
      resolveVideoThumbnailSource(thumbnailClient({ requireSignedURLs: true })),
    )

    expect(resolved.source).toBe(
      "https://customer-example.cloudflarestream.com/signed.token-value/thumbnails/thumbnail.jpg",
    )
  })

  test("maps a provider details failure to a typed error", async () => {
    const client = thumbnailClient()
    client.details.mockImplementation(() => Promise.reject(new Error("provider unavailable")))

    expect(await thumbnailFailure(client)).toBe("details")
  })

  test("maps a token failure to a typed error", async () => {
    const client = thumbnailClient({ requireSignedURLs: true })
    client.generateToken.mockImplementation(() => Promise.reject(new Error("no signing key")))

    expect(await thumbnailFailure(client)).toBe("sign")
  })

  test("rejects a missing or foreign thumbnail URL", async () => {
    expect(await thumbnailFailure(thumbnailClient({ thumbnail: "" }))).toBe("validate")
    expect(
      await thumbnailFailure(thumbnailClient({ thumbnail: "https://example.com/thumbnail.jpg" })),
    ).toBe("validate")
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
