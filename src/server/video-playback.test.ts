import { describe, expect, test } from "bun:test"

import { Effect, Either } from "effect"

import { resolveVideoPlaybackUrl } from "./video-playback"

function videoDetails(dashPlaybackUrl: string) {
  return {
    details: async () => ({ dashPlaybackUrl }),
  }
}

describe("video playback URLs", () => {
  test("accepts Cloudflare Stream DASH delivery URLs", async () => {
    const url = "https://customer-example.cloudflarestream.com/video-id/manifest/video.mpd"

    expect(await Effect.runPromise(resolveVideoPlaybackUrl(videoDetails(url)))).toBe(url)
  })

  test("rejects playback URLs outside Cloudflare delivery", async () => {
    const result = await Effect.runPromise(
      Effect.either(resolveVideoPlaybackUrl(videoDetails("https://example.com/video.mpd"))),
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
        }),
      ),
    )

    expect(Either.isLeft(result)).toBeTrue()
    if (Either.isLeft(result)) expect(result.left.operation).toBe("details")
  })
})
