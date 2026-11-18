import { describe, expect, it } from "bun:test"

import { Result, Schema } from "effect"

import {
  isShareAvailable,
  MAX_SHARED_FILES,
  MAX_SHARED_TITLE_LENGTH,
  sharedContentSchema,
  SHARE_RETENTION_MS,
  truncateSharedTitle,
} from "./share-intake"

describe("shared content boundaries", () => {
  it("accepts supported images without trusting browser metadata as image validation", () => {
    const photo = new File([new Uint8Array(4)], "photo.png", { type: "image/png" })
    const files = [photo]
    expect(
      Result.isSuccess(Schema.decodeResult(sharedContentSchema, { errors: "all" })({ files })),
    ).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({
          files: [new File([new Uint8Array(4)], "photo.png")],
        }),
      ),
    ).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({
          files: [new File([new Uint8Array(4)], "photo.svg", { type: "image/svg+xml" })],
        }),
      ),
    ).toBe(false)
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({
          files: Array.from({ length: MAX_SHARED_FILES + 1 }, () => photo),
        }),
      ),
    ).toBe(false)
  })

  it("rejects oversized files, combined payloads, empty input, and unsafe URLs", () => {
    const large = new File([new Uint8Array(15 * 1024 * 1024 + 1)], "photo.png", {
      type: "image/png",
    })
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({ files: [large] }),
      ),
    ).toBe(false)
    const medium = new File([new Uint8Array(13 * 1024 * 1024)], "photo.png", { type: "image/png" })
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({
          files: [medium, medium, medium, medium],
        }),
      ),
    ).toBe(false)
    expect(Result.isSuccess(Schema.decodeResult(sharedContentSchema, { errors: "all" })({}))).toBe(
      false,
    )
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({
          url: "javascript:alert(1)",
        }),
      ),
    ).toBe(false)
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({
          url: "https://example.com/",
        }),
      ),
    ).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({
          text: "x".repeat(10_000),
          url: "https://example.com/",
        }),
      ),
    ).toBe(false)
  })

  it("expires shares and isolates account-owned data while allowing anonymous sign-in handoff", () => {
    const now = Date.now()
    const share = {
      id: crypto.randomUUID(),
      ownerId: "first",
      createdAt: now,
      content: Schema.decodeSync(sharedContentSchema, { errors: "all" })({ text: "hello" }),
    }
    expect(isShareAvailable(share, "first", now)).toBe(true)
    expect(isShareAvailable(share, "second", now)).toBe(false)
    expect(isShareAvailable(share, null, now)).toBe(false)
    expect(isShareAvailable({ ...share, ownerId: null }, "first", now)).toBe(true)
    expect(isShareAvailable(share, "first", now + SHARE_RETENTION_MS)).toBe(false)
    expect(isShareAvailable(share, "first", now - 1)).toBe(false)
  })

  it("shortens long shared titles so the share is still accepted", () => {
    const title = `${"Long page title ".repeat(10)}👩‍👩‍👧‍👦 end`
    const shortened = truncateSharedTitle(title)

    expect(shortened.length).toBeLessThanOrEqual(MAX_SHARED_TITLE_LENGTH)
    expect(shortened.endsWith("…")).toBe(true)
    expect(title.startsWith(shortened.slice(0, -1))).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(sharedContentSchema, { errors: "all" })({ title: shortened }),
      ),
    ).toBe(true)
    expect(truncateSharedTitle("A short title")).toBe("A short title")
  })

  it("does not split an emoji at the title limit", () => {
    const family = "👩‍👩‍👧‍👦"
    const title = `${"a".repeat(MAX_SHARED_TITLE_LENGTH - 5)}${family}${family}`
    const shortened = truncateSharedTitle(title)

    expect(shortened).toBe(`${"a".repeat(MAX_SHARED_TITLE_LENGTH - 5)}…`)
  })
})
