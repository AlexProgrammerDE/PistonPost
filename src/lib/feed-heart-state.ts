export const FEED_HEART_BATCH_SIZE = 30

export function batchFeedPostIds(postIds: readonly string[]) {
  const uniquePostIds = Array.from(new Set(postIds))
  const batches: string[][] = []

  for (let offset = 0; offset < uniquePostIds.length; offset += FEED_HEART_BATCH_SIZE) {
    batches.push(uniquePostIds.slice(offset, offset + FEED_HEART_BATCH_SIZE))
  }

  return batches
}
