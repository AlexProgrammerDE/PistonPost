import type { Database } from "bun:sqlite"

import { RepositoryError } from "@pistonpost/domain"
import { Effect } from "effect"

type D1BatchBinding<TStatement, TResult> = {
  readonly batch: (statements: ReadonlyArray<TStatement>) => Promise<ReadonlyArray<TResult>>
}

export function runD1Batch<TStatement, TResult>(
  binding: D1BatchBinding<TStatement, TResult>,
  statements: readonly [TStatement, ...ReadonlyArray<TStatement>],
) {
  return Effect.tryPromise({
    try: () => binding.batch(statements),
    catch: (cause) =>
      new RepositoryError({
        operation: "batch",
        message: cause instanceof Error ? cause.message : "D1 batch failed.",
      }),
  })
}

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
