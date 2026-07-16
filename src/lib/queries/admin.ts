import { queryOptions } from "@tanstack/react-query"

import type { AdminSection } from "@/lib/admin-sections"
import { getAdminRows } from "@/server/tables"

export interface AdminRowsInput {
  readonly section: AdminSection
  readonly query: string
  readonly cursor?: string
  readonly direction: "asc" | "desc"
}

export const adminRowsKeys = {
  all: ["admin", "rows"] as const,
  list: (input: AdminRowsInput) => [...adminRowsKeys.all, input] as const,
}

export function adminRowsQueryOptions(input: AdminRowsInput) {
  return queryOptions({
    queryKey: adminRowsKeys.list(input),
    queryFn: () => getAdminRows({ data: input }),
    staleTime: 0,
  })
}
