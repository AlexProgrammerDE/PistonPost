import { describe, expect, test } from "bun:test"

import { normalizeImageUploadMetadata } from "./image-file-normalization"

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe("image file normalization", () => {
  test("repairs a PNG mislabeled as a JPEG", async () => {
    const file = new File([PNG_BYTES], "camera-roll.jpg", {
      type: "image/jpeg",
      lastModified: 123,
    })

    const metadata = await normalizeImageUploadMetadata(file)

    expect(metadata).toEqual({ filename: "camera-roll.png", mimeType: "image/png" })
  })

  test("recognizes each supported signature without trusting browser metadata", async () => {
    const cases = [
      {
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        filename: "photo.bin",
        expectedName: "photo.jpg",
        expectedType: "image/jpeg",
      },
      {
        bytes: new TextEncoder().encode("RIFF0000WEBP"),
        filename: "sticker.bin",
        expectedName: "sticker.webp",
        expectedType: "image/webp",
      },
      {
        bytes: new Uint8Array([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0x00, 0x00, 0x00,
          0x00, 0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31,
        ]),
        filename: "art.bin",
        expectedName: "art.avif",
        expectedType: "image/avif",
      },
    ]

    const normalized = await Promise.all(
      cases.map(({ bytes, filename }) => normalizeImageUploadMetadata(new File([bytes], filename))),
    )

    expect(normalized).toEqual(
      cases.map(({ expectedName, expectedType }) => ({
        filename: expectedName,
        mimeType: expectedType,
      })),
    )
  })

  test("leaves unrecognized bytes for the server to reject", async () => {
    const file = new File(["not actually an image"], "broken.png", { type: "image/png" })

    expect(await normalizeImageUploadMetadata(file)).toEqual({
      filename: "broken.png",
      mimeType: "image/png",
    })
  })
})
