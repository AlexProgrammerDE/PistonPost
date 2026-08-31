import { describe, expect, it } from "bun:test"

import {
  isShareAvailable,
  MAX_SHARED_FILES,
  sharedContentSchema,
  SHARE_RETENTION_MS,
} from "./share-intake"

describe("shared content boundaries", () => {
  it("accepts supported images without trusting browser metadata as image validation", () => {
    const files = [new File([new Uint8Array(4)], "photo.png", { type: "image/png" })]
    expect(sharedContentSchema.safeParse({ files }).success).toBe(true)
    expect(
      sharedContentSchema.safeParse({ files: [new File([new Uint8Array(4)], "photo.png")] })
        .success,
    ).toBe(true)
    expect(
      sharedContentSchema.safeParse({
        files: [new File([new Uint8Array(4)], "photo.svg", { type: "image/svg+xml" })],
      }).success,
    ).toBe(false)
    expect(
      sharedContentSchema.safeParse({
        files: Array.from({ length: MAX_SHARED_FILES + 1 }, () => files[0]),
      }).success,
    ).toBe(false)
  })

  it("rejects oversized files, combined payloads, empty input, and unsafe URLs", () => {
    const large = new File([new Uint8Array(15 * 1024 * 1024 + 1)], "photo.png", {
      type: "image/png",
    })
    expect(sharedContentSchema.safeParse({ files: [large] }).success).toBe(false)
    const medium = new File([new Uint8Array(13 * 1024 * 1024)], "photo.png", { type: "image/png" })
    expect(sharedContentSchema.safeParse({ files: [medium, medium, medium, medium] }).success).toBe(
      false,
    )
    expect(sharedContentSchema.safeParse({}).success).toBe(false)
    expect(sharedContentSchema.safeParse({ url: "javascript:alert(1)" }).success).toBe(false)
    expect(sharedContentSchema.safeParse({ url: "https://example.com/" }).success).toBe(true)
    expect(
      sharedContentSchema.safeParse({ text: "x".repeat(10_000), url: "https://example.com/" })
        .success,
    ).toBe(false)
  })

  it("expires shares and isolates account-owned data while allowing anonymous sign-in handoff", () => {
    const now = Date.now()
    const share = {
      id: crypto.randomUUID(),
      ownerId: "first",
      createdAt: now,
      content: sharedContentSchema.parse({ text: "hello" }),
    }
    expect(isShareAvailable(share, "first", now)).toBe(true)
    expect(isShareAvailable(share, "second", now)).toBe(false)
    expect(isShareAvailable(share, null, now)).toBe(false)
    expect(isShareAvailable({ ...share, ownerId: null }, "first", now)).toBe(true)
    expect(isShareAvailable(share, "first", now + SHARE_RETENTION_MS)).toBe(false)
    expect(isShareAvailable(share, "first", now - 1)).toBe(false)
  })
})
