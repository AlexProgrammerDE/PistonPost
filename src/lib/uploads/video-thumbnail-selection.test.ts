import { describe, expect, test } from "bun:test"

import {
  scoreVideoThumbnailFrame,
  selectBestVideoThumbnailCandidate,
  validateVideoDuration,
  type VideoThumbnailFrame,
} from "./video-thumbnail-selection"
import { MAX_VIDEO_DURATION_SECONDS } from "./video-upload-policy"

function frame(width: number, height: number, pixel: (x: number, y: number) => readonly number[]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const [red = 0, green = 0, blue = 0] = pixel(x, y)
      data[offset] = red
      data[offset + 1] = green
      data[offset + 2] = blue
      data[offset + 3] = 255
    }
  }
  return { data, width, height } satisfies VideoThumbnailFrame
}

describe("video thumbnail selection", () => {
  test("prefers a visible detailed frame over black and blank frames", () => {
    const black = frame(8, 8, () => [0, 0, 0])
    const blank = frame(8, 8, () => [128, 128, 128])
    const detailed = frame(8, 8, (x, y) => ((x + y) % 2 === 0 ? [225, 70, 45] : [35, 85, 210]))

    expect(scoreVideoThumbnailFrame(detailed)).toBeGreaterThan(scoreVideoThumbnailFrame(blank))
    expect(
      selectBestVideoThumbnailCandidate([
        { timestampPct: 0.1, frame: black },
        { timestampPct: 0.5, frame: blank },
        { timestampPct: 0.7, frame: detailed },
      ]),
    ).toBe(0.7)
  })

  test("uses the midpoint when no frame can be sampled", () => {
    expect(selectBestVideoThumbnailCandidate([])).toBe(0.5)
  })

  test("rejects unreadable and overlong videos before upload", () => {
    expect(validateVideoDuration(MAX_VIDEO_DURATION_SECONDS)).toBe(MAX_VIDEO_DURATION_SECONDS)
    expect(() => validateVideoDuration(MAX_VIDEO_DURATION_SECONDS + 0.001)).toThrow(
      "no longer than 10 minutes",
    )
    expect(() => validateVideoDuration(Number.POSITIVE_INFINITY)).toThrow("could not be read")
    expect(() => validateVideoDuration(0)).toThrow("could not be read")
  })
})
