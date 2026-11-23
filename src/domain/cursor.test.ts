import { describe, expect, it } from "bun:test"

import { Effect } from "effect"
import { Base64Url } from "effect/encoding"

import { decodePublicPostCursor, encodePublicPostCursor } from "./cursor"

describe("public post cursors", () => {
  it("round trips a published timestamp and stable ID", async () => {
    const cursor = { id: "01K123", publishedAt: new Date("2026-01-02T03:04:05.000Z") }
    const decoded = await Effect.runPromise(decodePublicPostCursor(encodePublicPostCursor(cursor)))

    expect(decoded).toEqual(cursor)
  })

  it("rejects malformed cursors", async () => {
    const result = await Effect.runPromiseExit(decodePublicPostCursor("not-a-cursor"))
    expect(result._tag).toBe("Failure")
  })

  it.each([8.64e15 + 1, -8.64e15 - 1, 1e300, 1.5])(
    "rejects a timestamp that is not a valid date in milliseconds: %p",
    async (publishedAt) => {
      const value = Base64Url.encode(JSON.stringify({ publishedAt, id: "01K123" }))
      const result = await Effect.runPromiseExit(decodePublicPostCursor(value))
      expect(result._tag).toBe("Failure")
    },
  )

  it("accepts the largest valid date", async () => {
    const cursor = { id: "01K123", publishedAt: new Date(8.64e15) }
    const decoded = await Effect.runPromise(decodePublicPostCursor(encodePublicPostCursor(cursor)))
    expect(decoded).toEqual(cursor)
  })
})
