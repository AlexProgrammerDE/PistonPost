import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"

import { getPublicFeed, getPublishedPost, getPublicProfile } from "@/server/posts"

export type FeedFilters = {
  readonly tag?: string
  readonly username?: string
}

export function feedQueryOptions(filters: FeedFilters = {}) {
  return infiniteQueryOptions({
    queryKey: ["posts", "public-feed", filters] as const,
    queryFn: ({ pageParam }) =>
      getPublicFeed({ data: { ...filters, cursor: pageParam, limit: 12 } }),
    initialPageParam: undefined as string | undefined,
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
