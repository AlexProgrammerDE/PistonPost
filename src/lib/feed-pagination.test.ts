import { describe, expect, it } from "bun:test"

import { feedPageHref } from "./feed-pagination"

describe("feed pagination links", () => {
  it("produces crawlable URLs without corrupting opaque cursors", () => {
    expect(feedPageHref("/tag/art", undefined)).toBe("/tag/art")
    expect(feedPageHref("/tag/art", "date+id=/value")).toBe("/tag/art?cursor=date%2Bid%3D%2Fvalue")
  })
})
