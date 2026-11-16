/** The most post IDs one heart state request may carry. */
export const FEED_HEART_BATCH_SIZE = 30

/** Feeds load this many posts per page. */
export const FEED_PAGE_SIZE = 12

/**
 * Splits feed post IDs into heart state requests that follow feed page boundaries. Loading another
 * page adds a request and keeps the keys of the pages above it, so their hearts stay usable.
 */
export function batchFeedPostIds(postIds: readonly string[]) {
  const uniquePostIds = Array.from(new Set(postIds))
  const batches: string[][] = []

  for (let offset = 0; offset < uniquePostIds.length; offset += FEED_PAGE_SIZE) {
    batches.push(uniquePostIds.slice(offset, offset + FEED_PAGE_SIZE))
  }

  return batches
}
