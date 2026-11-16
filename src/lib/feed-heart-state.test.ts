import { describe, expect, test } from "bun:test"

import { batchFeedPostIds, FEED_HEART_BATCH_SIZE, FEED_PAGE_SIZE } from "./feed-heart-state"

function postIds(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => `post-${String(from + index)}`)
}

describe("feed heart state batching", () => {
  test("deduplicates post IDs and keeps every request within the server boundary", () => {
    const ids = [...postIds(0, FEED_PAGE_SIZE + 1), "post-0"]

    const batches = batchFeedPostIds(ids)

    expect(FEED_PAGE_SIZE).toBeLessThanOrEqual(FEED_HEART_BATCH_SIZE)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(FEED_PAGE_SIZE)
    expect(batches[1]).toEqual([`post-${String(FEED_PAGE_SIZE)}`])
    expect(batches.flat()).toEqual(Array.from(new Set(ids)))
  })

  test("keeps the batches of loaded pages when another page loads", () => {
    const firstPage = postIds(0, FEED_PAGE_SIZE)
    const secondPage = postIds(FEED_PAGE_SIZE, FEED_PAGE_SIZE)

    const before = batchFeedPostIds(firstPage)
    const after = batchFeedPostIds([...firstPage, ...secondPage])

    expect(after[0]).toEqual(before[0])
    expect(after[1]).toEqual(secondPage)
  })
})
