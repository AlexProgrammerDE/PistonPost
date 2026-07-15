import { queryOptions } from "@tanstack/react-query"

import { getOwnedMediaStatus } from "@/server/composer"

export function ownedMediaStatusQueryOptions(ids: string[]) {
  const stableIds = ids.toSorted()
  return queryOptions({
    queryKey: ["media", "owned-status", stableIds] as const,
    queryFn: () => getOwnedMediaStatus({ data: { ids: stableIds } }),
    staleTime: 0,
    gcTime: 5 * 60 * 1_000,
  })
}
