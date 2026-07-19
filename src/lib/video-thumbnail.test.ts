import { describe, expect, test } from "bun:test"

import { createStreamThumbnailUrl, resolveVideoThumbnailTimestampPct } from "./video-thumbnail"

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
})
