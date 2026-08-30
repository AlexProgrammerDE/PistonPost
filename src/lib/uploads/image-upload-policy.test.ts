import { describe, expect, test } from "bun:test"

import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE,
  createImageUploadBatches,
  imageFilenameMatchesMime,
  isImageUploadMimeType,
} from "./image-upload-policy"

describe("image upload policy", () => {
  test("accepts only the formats supported by the Worker image pipeline", () => {
    expect(IMAGE_UPLOAD_ACCEPT).toBe(IMAGE_UPLOAD_MIME_TYPES.join(","))
    expect(isImageUploadMimeType("image/jpeg")).toBeTrue()
    expect(isImageUploadMimeType("image/avif")).toBeTrue()
    expect(isImageUploadMimeType("image/gif")).toBeTrue()
    expect(isImageUploadMimeType("image/svg+xml")).toBeFalse()
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
