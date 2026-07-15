import { infiniteQueryOptions } from "@tanstack/react-query"

import { getDiscussion } from "@/server/social"

export function discussionQueryOptions(postId: string) {
  return infiniteQueryOptions({
    queryKey: ["discussion", postId] as const,
    queryFn: ({ pageParam }) => getDiscussion({ data: { postId, cursor: pageParam, limit: 25 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
  })
}
