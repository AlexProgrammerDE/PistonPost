import { describe, expect, it } from "bun:test"

import { Effect } from "effect"

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
})
