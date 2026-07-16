import { queryOptions } from "@tanstack/react-query"

import { getFollowState, type FollowTarget } from "@/server/follows"

export const followKeys = {
  all: ["follows"] as const,
  state: (viewerId: string, target: FollowTarget) =>
    [...followKeys.all, "state", viewerId, target] as const,
}

export function followStateQueryOptions(viewerId: string, target: FollowTarget) {
  return queryOptions({
    queryKey: followKeys.state(viewerId, target),
    queryFn: () => getFollowState({ data: target }),
    staleTime: 15_000,
  })
}
