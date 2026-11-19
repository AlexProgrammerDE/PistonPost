import { describe, expect, test } from "bun:test"

import {
  imagePreparationStrategy,
  imageTranscodePlan,
  shouldUseImageTranscode,
} from "./image-preparation-policy"

describe("image preparation policy", () => {
  test("keeps ordinary JPEGs in their losslessly sanitized container", () => {
    expect(
      imageTranscodePlan({
        mimeType: "image/jpeg",
        byteSize: 1_000_000,
        width: 2000,
        height: 1000,
      }),
    ).toBeNull()
  })

  test("bounds large photos while keeping their aspect ratio", () => {
    expect(
      imageTranscodePlan({
        mimeType: "image/jpeg",
        byteSize: 5_000_000,
        width: 8000,
        height: 6000,
      }),
    ).toEqual({ width: 4096, height: 3072, required: true })
  })

  test("requires AVIF conversion but only keeps optional compression with real savings", () => {
    expect(
      imageTranscodePlan({
        mimeType: "image/avif",
        byteSize: 500_000,
        width: 1200,
        height: 800,
      }),
    ).toEqual({ width: 1200, height: 800, required: true })
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

  test("converts JPEGs above the sanitizer pixel limit before sanitizing", () => {
    expect(imagePreparationStrategy("image/jpeg", { width: 2000, height: 1000 })).toBe("sanitize")
    expect(imagePreparationStrategy("image/jpeg", { width: 2001, height: 1000 })).toBe("transcode")
    expect(imagePreparationStrategy("image/jpeg", { width: 8000, height: 6000 })).toBe("transcode")
    expect(imagePreparationStrategy("image/jpeg", { width: 10_000, height: 8000 })).toBe(
      "transcode",
    )
    expect(imagePreparationStrategy("image/jpeg", { width: 10_000, height: 8001 })).toBe(
      "too-large",
    )
  })

  test("leaves the sanitizer to judge other formats and unreadable JPEG headers", () => {
    expect(imagePreparationStrategy("image/jpeg", null)).toBe("sanitize")
    expect(imagePreparationStrategy("image/png", { width: 8000, height: 6000 })).toBe("sanitize")
    expect(imagePreparationStrategy("image/gif", null)).toBe("sanitize")
    expect(imagePreparationStrategy("image/avif", null)).toBe("transcode")
  })

  test("requires the WebP conversion for small but over-limit JPEG files", () => {
    expect(
      imageTranscodePlan({ mimeType: "image/jpeg", byteSize: 400_000, width: 2001, height: 1000 }),
    ).toEqual({ width: 2001, height: 1000, required: true })
    expect(
      imageTranscodePlan({ mimeType: "image/png", byteSize: 5_000_000, width: 8000, height: 6000 }),
    ).toBeNull()
  })
})
