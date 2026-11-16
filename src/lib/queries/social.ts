import {
  infiniteQueryOptions,
  notifyManager,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query"

import { markPostFeedsStale, postQueryOptions, setCachedPostHeartCount } from "@/lib/queries/posts"
import { getDiscussion, getDiscussionViewer, getFeedHeartStates } from "@/server/social"

export const discussionKeys = {
  all: ["discussion"] as const,
  public: (postId: string) => [...discussionKeys.all, "public", postId] as const,
  viewerPost: (postId: string) => [...discussionKeys.all, "viewer", postId] as const,
  viewer: (postId: string, viewerId: string) =>
    [...discussionKeys.viewerPost(postId), viewerId] as const,
  feedViewer: () => [...discussionKeys.all, "feed-viewer"] as const,
  feedViewerBatch: (viewerId: string, postIds: readonly string[]) =>
    [...discussionKeys.feedViewer(), viewerId, postIds] as const,
}

export function discussionQueryOptions(postId: string) {
  return infiniteQueryOptions({
    queryKey: discussionKeys.public(postId),
    queryFn: ({ pageParam }) => getDiscussion({ data: { postId, cursor: pageParam, limit: 25 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
  })
}

export function discussionViewerQueryOptions(postId: string, viewerId: string) {
  return queryOptions({
    queryKey: discussionKeys.viewer(postId, viewerId),
    queryFn: () => getDiscussionViewer({ data: { postId } }),
    staleTime: 10_000,
  })
}

type FeedHeartStates = Awaited<ReturnType<typeof getFeedHeartStates>>

export function feedHeartStatesQueryOptions(
  postIds: readonly string[],
  viewerId: string,
  enabled = true,
) {
  return queryOptions({
    queryKey: discussionKeys.feedViewerBatch(viewerId, postIds),
    queryFn: () => getFeedHeartStates({ data: { postIds: [...postIds] } }),
    enabled,
    staleTime: 10_000,
  })
}

function batchIncludesPost(queryKey: readonly unknown[], postId: string) {
  const postIds = queryKey[3]
  return Array.isArray(postIds) && postIds.includes(postId)
}

/**
 * Returns the heart state of every post that any cached feed batch of this viewer knows. A new post
 * or page changes the batch keys, so earlier batches keep known hearts usable while new ones load.
 */
export function cachedFeedHeartStates(queryClient: QueryClient, viewerId: string) {
  const heartStates = new Map<string, boolean>()
  for (const [queryKey, data] of queryClient.getQueriesData<FeedHeartStates>({
    queryKey: [...discussionKeys.feedViewer(), viewerId],
  })) {
    const postIds = queryKey[3]
    if (!data || !Array.isArray(postIds)) continue
    const heartPostIds = new Set(data.heartPostIds)
    for (const postId of postIds) {
      if (typeof postId === "string") heartStates.set(postId, heartPostIds.has(postId))
    }
  }
  return heartStates
}

function setCachedViewerHeart(
  queryClient: QueryClient,
  viewerId: string,
  postId: string,
  active: boolean,
) {
  queryClient.setQueriesData<FeedHeartStates>(
    {
      queryKey: [...discussionKeys.feedViewer(), viewerId],
      predicate: (query) => batchIncludesPost(query.queryKey, postId),
    },
    (current) => {
      if (!current) return current
      const heartPostIds = current.heartPostIds.filter((id) => id !== postId)
      return { ...current, heartPostIds: active ? [...heartPostIds, postId] : heartPostIds }
    },
  )
  queryClient.setQueryData(discussionViewerQueryOptions(postId, viewerId).queryKey, (current) => {
    if (!current || current.viewerId === null) return current
    return {
      viewerId: current.viewerId,
      viewerRole: current.viewerRole,
      viewerHasHeart: active,
    }
  })
}

/**
 * Writes a confirmed heart and its count to every cache that shows them in one notification, so
 * the count and the pressed state never render out of step. Other views refetch when they mount.
 */
export function applyConfirmedHeart(
  queryClient: QueryClient,
  input: {
    readonly viewerId: string
    readonly postId: string
    readonly active: boolean
    readonly heartCount: number
  },
) {
  notifyManager.batch(() => {
    setCachedViewerHeart(queryClient, input.viewerId, input.postId, input.active)
    setCachedPostHeartCount(queryClient, input.postId, input.heartCount)
  })
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: discussionKeys.viewerPost(input.postId),
      refetchType: "none",
    }),
    queryClient.invalidateQueries({
      queryKey: postQueryOptions(input.postId).queryKey,
      refetchType: "none",
    }),
    markPostFeedsStale(queryClient),
  ])
}

/** Refreshes the post after its comments change and marks feeds and feed hearts stale. */
export function refreshAfterCommentChange(queryClient: QueryClient, postId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: discussionKeys.public(postId) }),
    queryClient.invalidateQueries({ queryKey: postQueryOptions(postId).queryKey }),
    markPostFeedsStale(queryClient),
  ])
}
