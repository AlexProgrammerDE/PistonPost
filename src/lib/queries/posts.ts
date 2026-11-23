import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"

import type { PublicPostRead } from "@/db/public-read-model"
import { FEED_PAGE_SIZE } from "@/lib/feed-heart-state"
import { getFollowingFeed } from "@/server/follows"
import { getOwnedUnlistedPosts } from "@/server/owned-posts"
import { getPublicFeed, getPublishedPost, getPublicProfile, getPublicTag } from "@/server/posts"

export type FeedFilters = {
  readonly tag?: string
  readonly username?: string
}

export function feedQueryOptions(filters: FeedFilters = {}, initialCursor?: string) {
  return infiniteQueryOptions({
    queryKey: [...postFeedKeys.public, filters, initialCursor ?? null] as const,
    queryFn: ({ pageParam }) =>
      getPublicFeed({ data: { ...filters, cursor: pageParam, limit: FEED_PAGE_SIZE } }),
    initialPageParam: initialCursor,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  })
}

export const postFeedKeys = {
  public: ["posts", "public-feed"] as const,
  following: ["posts", "following-feed"] as const,
  ownedUnlisted: ["posts", "owned-unlisted"] as const,
}

/**
 * The signed-in viewer's own unlisted posts on a profile. The server returns nothing for another
 * user's profile. The key holds the viewer so accounts never share cached results.
 */
export function ownedUnlistedPostsQueryOptions(viewerId: string, username: string) {
  return infiniteQueryOptions({
    queryKey: [...postFeedKeys.ownedUnlisted, viewerId, username] as const,
    queryFn: ({ pageParam }) =>
      getOwnedUnlistedPosts({ data: { username, cursor: pageParam, limit: FEED_PAGE_SIZE } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  })
}

export function followingFeedQueryOptions(viewerId: string, initialCursor?: string) {
  return infiniteQueryOptions({
    queryKey: [...postFeedKeys.following, viewerId, initialCursor ?? null] as const,
    queryFn: ({ pageParam }) =>
      getFollowingFeed({ data: { cursor: pageParam, limit: FEED_PAGE_SIZE } }),
    initialPageParam: initialCursor,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  })
}

export function postQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["posts", "published", id] as const,
    queryFn: () => getPublishedPost({ data: { id } }),
    staleTime: 60_000,
  })
}

export function profileQueryOptions(username: string) {
  return queryOptions({
    queryKey: ["profiles", "public", username] as const,
    queryFn: () => getPublicProfile({ data: { username } }),
    staleTime: 60_000,
  })
}

export function tagQueryOptions(tag: string) {
  return queryOptions({
    queryKey: ["tags", "public", tag] as const,
    queryFn: () => getPublicTag({ data: { tag } }),
    staleTime: 60_000,
  })
}

type FeedPage = { readonly posts: readonly PublicPostRead[] }

function withPostHeartCount<TPage extends FeedPage>(
  data: InfiniteData<TPage> | undefined,
  postId: string,
  heartCount: number,
): InfiniteData<TPage> | undefined {
  if (!data?.pages.some((page) => page.posts.some((post) => post.id === postId))) return data
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.posts.some((post) => post.id === postId)
        ? {
            ...page,
            posts: page.posts.map((post) => (post.id === postId ? { ...post, heartCount } : post)),
          }
        : page,
    ),
  }
}

/** Writes a confirmed heart count to the cached post and every loaded feed that shows it. */
export function setCachedPostHeartCount(
  queryClient: QueryClient,
  postId: string,
  heartCount: number,
) {
  queryClient.setQueryData(postQueryOptions(postId).queryKey, (current) =>
    current ? { ...current, heartCount } : current,
  )
  queryClient.setQueriesData<InfiniteData<Awaited<ReturnType<typeof getPublicFeed>>>>(
    { queryKey: postFeedKeys.public },
    (current) => withPostHeartCount(current, postId, heartCount),
  )
  queryClient.setQueriesData<InfiniteData<Awaited<ReturnType<typeof getFollowingFeed>>>>(
    { queryKey: postFeedKeys.following },
    (current) => withPostHeartCount(current, postId, heartCount),
  )
  queryClient.setQueriesData<InfiniteData<Awaited<ReturnType<typeof getOwnedUnlistedPosts>>>>(
    { queryKey: postFeedKeys.ownedUnlisted },
    (current) => withPostHeartCount(current, postId, heartCount),
  )
}

/**
 * Refreshes post data after the owner edits or deletes a post. The detail loader returns cached
 * data even when it is stale, so the post entry is dropped and the next visit loads it again.
 */
export function refreshAfterPostChange(queryClient: QueryClient, postId: string) {
  queryClient.removeQueries({ queryKey: postQueryOptions(postId).queryKey, exact: true })
  return queryClient.invalidateQueries({ queryKey: ["posts"] })
}

/**
 * Marks loaded feeds stale without refetching them now. Refetching would reload every loaded page,
 * so the feeds update the next time they mount or the window regains focus.
 */
export function markPostFeedsStale(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: postFeedKeys.public, refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: postFeedKeys.following, refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: postFeedKeys.ownedUnlisted, refetchType: "none" }),
  ])
}
