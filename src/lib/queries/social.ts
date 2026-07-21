import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"

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
