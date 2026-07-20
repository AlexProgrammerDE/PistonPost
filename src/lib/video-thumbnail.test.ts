import { describe, expect, test } from "bun:test"

import {
  createStreamThumbnailUrl,
  createVideoPreviewThumbnails,
  resolveVideoThumbnailTimestampPct,
} from "./video-thumbnail"

describe("Stream thumbnail URLs", () => {
  test("uses the selected frame and Stream-compatible output dimensions", () => {
    const thumbnail = createStreamThumbnailUrl({
      source: "https://customer.example.com/video/thumbnails/thumbnail.jpg",
      durationSeconds: 40,
      timestampPct: 0.25,
      width: 1200,
      height: 675,
    })

    expect(thumbnail.searchParams.get("time")).toBe("10s")
    expect(thumbnail.searchParams.get("width")).toBe("1200")
    expect(thumbnail.searchParams.get("height")).toBe("674")
    expect(thumbnail.searchParams.get("fit")).toBe("clip")
  })

  test("falls back to the midpoint for first-frame and invalid selections", () => {
    expect(resolveVideoThumbnailTimestampPct(0)).toBe(0.5)
    expect(resolveVideoThumbnailTimestampPct(Number.NaN)).toBe(0.5)
    expect(resolveVideoThumbnailTimestampPct(0.8)).toBe(0.8)
  })

  test("uses a requested preview time without reading beyond the video", () => {
    const thumbnail = createStreamThumbnailUrl({
      source: "https://customer.example.com/video/thumbnails/thumbnail.jpg",
      durationSeconds: 40,
      timestampPct: 0.5,
      timeSeconds: 90,
      width: 320,
      height: 180,
    })

    expect(thumbnail.searchParams.get("time")).toBe("39.999s")
  })

  test("builds bounded timeline preview cues", () => {
    const thumbnails = createVideoPreviewThumbnails({
      mediaId: "video-id",
      durationMilliseconds: 222_000,
    })

    expect(thumbnails).toHaveLength(28)
    expect(thumbnails[0]).toEqual({
      url: "/media/video/video-id/thumbnail?v=5&time=0&width=320&height=180",
      startTime: 0,
      endTime: 8,
      width: 320,
      height: 180,
    })
    expect(thumbnails.at(-1)).toMatchObject({ startTime: 216, endTime: 222 })
  })

  test("omits previews when video duration is unavailable", () => {
    expect(
      createVideoPreviewThumbnails({ mediaId: "video-id", durationMilliseconds: null }),
    ).toEqual([])
  })
})
