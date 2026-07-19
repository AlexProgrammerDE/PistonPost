import { describe, expect, test } from "bun:test"

import {
  MAX_GIF_ANIMATION_PIXELS,
  inspectGif,
  isGifAnimationWithinPixelLimit,
} from "./gif-inspection"

function gifWithFrames(width: number, height: number, frameCount: number) {
  const bytes = [
    ...new TextEncoder().encode("GIF89a"),
    width & 0xff,
    width >> 8,
    height & 0xff,
    height >> 8,
    0x80,
    0,
    0,
    0,
    0,
    0,
    0xff,
    0xff,
    0xff,
  ]

  for (let frame = 0; frame < frameCount; frame += 1) {
    bytes.push(
      0x2c,
      0,
      0,
      0,
      0,
      width & 0xff,
      width >> 8,
      height & 0xff,
      height >> 8,
      0,
      2,
      1,
      0,
      0,
    )
  }

  bytes.push(0x3b)
  return new Uint8Array(bytes)
}

describe("GIF inspection", () => {
  test("counts animation frames against the logical canvas", () => {
    expect(inspectGif(gifWithFrames(320, 180, 3))).toEqual({
      frameCount: 3,
      width: 320,
      height: 180,
      totalPixels: 320 * 180 * 3,
    })
  })

  test("accepts a large still GIF but bounds animated GIF work", () => {
    const still = inspectGif(gifWithFrames(10_000, 6_000, 1))
    const animation = inspectGif(gifWithFrames(1_000, 1_000, 51))

    expect(still).not.toBeNull()
    expect(animation?.totalPixels).toBeGreaterThan(MAX_GIF_ANIMATION_PIXELS)
    if (!still || !animation) throw new Error("The GIF fixtures must be structurally valid.")
    expect(isGifAnimationWithinPixelLimit(still)).toBeTrue()
    expect(isGifAnimationWithinPixelLimit(animation)).toBeFalse()
  })

  test("rejects truncated and out-of-bounds frame data", () => {
    const truncated = gifWithFrames(10, 10, 1).slice(0, -1)
    const outOfBounds = gifWithFrames(10, 10, 1)
    outOfBounds[24] = 11

    expect(inspectGif(truncated)).toBeNull()
    expect(inspectGif(outOfBounds)).toBeNull()
  })
})
