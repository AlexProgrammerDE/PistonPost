import { and, eq, lte, or } from "drizzle-orm"

import { user } from "@/db/schema"

export const SEARCH_INDEXING_PROBATION_DAYS = 7

const SEARCH_INDEXING_PROBATION_MS = SEARCH_INDEXING_PROBATION_DAYS * 24 * 60 * 60 * 1_000

type SearchIndexingAccount = {
  readonly createdAt: Date
  readonly emailVerified: boolean
  readonly role: string | null
}

export function isSearchIndexingTrusted(account: SearchIndexingAccount, now = new Date()) {
  if (account.role === "admin") return true
  if (!account.emailVerified) return false
  return account.createdAt.getTime() <= now.getTime() - SEARCH_INDEXING_PROBATION_MS
}

export function searchIndexingTrustCondition(now = new Date()) {
  const cutoff = new Date(now.getTime() - SEARCH_INDEXING_PROBATION_MS)
  return or(eq(user.role, "admin"), and(eq(user.emailVerified, true), lte(user.createdAt, cutoff)))
}
