import { describe, expect, it } from "bun:test"

import { SEARCH_INDEXING_PROBATION_DAYS, isSearchIndexingTrusted } from "./search-indexing"

const now = new Date("2026-07-17T12:00:00.000Z")

describe("search indexing trust", () => {
  it("indexes verified established accounts and administrators", () => {
    const established = new Date(now)
    established.setUTCDate(established.getUTCDate() - SEARCH_INDEXING_PROBATION_DAYS)

    expect(
      isSearchIndexingTrusted({ createdAt: established, emailVerified: true, role: "user" }, now),
    ).toBe(true)
    expect(
      isSearchIndexingTrusted(
        { createdAt: new Date(now), emailVerified: false, role: "admin" },
        now,
      ),
    ).toBe(true)
  })

  it("keeps new or unverified accounts out of search", () => {
    expect(
      isSearchIndexingTrusted({ createdAt: new Date(now), emailVerified: true, role: "user" }, now),
    ).toBe(false)
    expect(
      isSearchIndexingTrusted(
        { createdAt: new Date("2020-01-01T00:00:00.000Z"), emailVerified: false, role: null },
        now,
      ),
    ).toBe(false)
  })
})
