import { describe, expect, test } from "bun:test"

import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE,
  createImageUploadBatches,
  MAX_GIF_PIXELS,
  MAX_IMAGE_PIXELS,
  MAX_JPEG_PIXELS,
  imageFilenameMatchesMime,
  isImageUploadMimeType,
  isWithinImagePixelLimit,
} from "./image-upload-policy"

describe("image upload policy", () => {
  test("accepts only the formats supported by the Worker image pipeline", () => {
    expect(IMAGE_UPLOAD_ACCEPT).toBe(IMAGE_UPLOAD_MIME_TYPES.join(","))
    expect(isImageUploadMimeType("image/jpeg")).toBeTrue()
    expect(isImageUploadMimeType("image/avif")).toBeTrue()
    expect(isImageUploadMimeType("image/gif")).toBeTrue()
    expect(isImageUploadMimeType("image/svg+xml")).toBeFalse()
  })

  test("bounds pixels per format at the limits the Worker sanitizer can hold in memory", () => {
    expect([MAX_JPEG_PIXELS, MAX_GIF_PIXELS, MAX_IMAGE_PIXELS]).toEqual([
      2_000_000, 8_000_000, 80_000_000,
    ])
    const cases = [
      ["image/jpeg", 2000, 1000, 2001, 1000],
      ["image/gif", 4000, 2000, 4000, 2001],
      ["image/png", 10_000, 8000, 10_000, 8001],
      ["image/webp", 10_000, 8000, 10_000, 8001],
      ["image/avif", 10_000, 8000, 10_000, 8001],
    ] as const
    for (const [mimeType, width, height, overWidth, overHeight] of cases) {
      expect(isWithinImagePixelLimit(mimeType, width, height)).toBeTrue()
      expect(isWithinImagePixelLimit(mimeType, overWidth, overHeight)).toBeFalse()
    }
    expect(isWithinImagePixelLimit("image/png", 0, 1)).toBeFalse()
  })

  test("requires the filename extension to agree with the decoded MIME type", () => {
    expect(imageFilenameMatchesMime("avatar.JPG", "image/jpeg")).toBeTrue()
    expect(imageFilenameMatchesMime("avatar.jpeg", "image/jpeg")).toBeTrue()
    expect(imageFilenameMatchesMime("avatar.GIF", "image/gif")).toBeTrue()
    expect(imageFilenameMatchesMime("avatar.webp", "image/webp")).toBeTrue()
    expect(imageFilenameMatchesMime("avatar.png", "image/avif")).toBeFalse()
    expect(imageFilenameMatchesMime("avatar", "image/png")).toBeFalse()
  })

  test("keeps upload intent requests bounded without changing file order", () => {
    const files = Array.from(
      { length: MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE * 2 + 1 },
      (_, index) => `image-${index.toString()}`,
    )
    const batches = createImageUploadBatches(files)

    expect(batches.map((batch) => batch.length)).toEqual([
      MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE,
      MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE,
      1,
    ])
    expect(batches.flat()).toEqual(files)
  })
})
