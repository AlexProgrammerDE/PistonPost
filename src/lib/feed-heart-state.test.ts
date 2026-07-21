import { describe, expect, test } from "bun:test"

import { batchFeedPostIds, FEED_HEART_BATCH_SIZE } from "./feed-heart-state"

describe("feed heart state batching", () => {
  test("deduplicates post IDs and keeps every request within the server boundary", () => {
    const postIds = [
      ...Array.from({ length: FEED_HEART_BATCH_SIZE + 1 }, (_, index) => `post-${String(index)}`),
      "post-0",
    ]

    const batches = batchFeedPostIds(postIds)

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(FEED_HEART_BATCH_SIZE)
    expect(batches[1]).toEqual([`post-${String(FEED_HEART_BATCH_SIZE)}`])
    expect(batches.flat()).toEqual(Array.from(new Set(postIds)))
  })
})
