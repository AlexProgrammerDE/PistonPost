import { describe, expect, test } from "bun:test"

import { imageTranscodePlan, shouldUseImageTranscode } from "./image-preparation-policy"

describe("image preparation policy", () => {
  test("keeps ordinary JPEGs in their losslessly sanitized container", () => {
    expect(
      imageTranscodePlan({
        mimeType: "image/jpeg",
        byteSize: 1_000_000,
        width: 2_000,
        height: 1_000,
      }),
    ).toBeNull()
  })

  test("bounds large photos while keeping their aspect ratio", () => {
    expect(
      imageTranscodePlan({
        mimeType: "image/jpeg",
        byteSize: 5_000_000,
        width: 8_000,
        height: 6_000,
      }),
    ).toEqual({ width: 4_096, height: 3_072, required: true })
  })

  test("requires AVIF conversion but only keeps optional compression with real savings", () => {
    expect(
      imageTranscodePlan({
        mimeType: "image/avif",
        byteSize: 500_000,
        width: 1_200,
        height: 800,
      }),
    ).toEqual({ width: 1_200, height: 800, required: true })
    expect(
      shouldUseImageTranscode({
        sourceByteSize: 4_000_000,
        transcodedByteSize: 3_850_000,
        required: false,
      }),
    ).toBe(false)
    expect(
      shouldUseImageTranscode({
        sourceByteSize: 4_000_000,
        transcodedByteSize: 3_500_000,
        required: false,
      }),
    ).toBe(true)
  })
})
