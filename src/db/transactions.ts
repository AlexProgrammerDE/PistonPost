import type { Database } from "bun:sqlite"

import { Effect } from "effect"

import { RepositoryError } from "@/domain"

export function runSqliteTransaction<A>(client: Database, operation: () => A) {
  return Effect.try({
    try: () => client.transaction(operation)(),
    catch: (cause) =>
      new RepositoryError({
        operation: "transaction",
        message: cause instanceof Error ? cause.message : "SQLite transaction failed.",
      }),
  })
}
