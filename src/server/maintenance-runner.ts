import { Cause, Data, Effect, Exit } from "effect"

export class MaintenanceError extends Data.TaggedError("MaintenanceError")<{
  readonly failures: ReadonlyArray<{ readonly task: string; readonly cause: Cause.Cause<unknown> }>
}> {}

/** A failed maintenance task must not interrupt independent cleanup work. */
export function runMaintenanceTasks<E, R>(
  tasks: ReadonlyArray<{
    readonly name: string
    readonly run: Effect.Effect<void, E, R>
  }>,
) {
  return Effect.gen(function* () {
    const outcomes = yield* Effect.forEach(
      tasks,
      (task) =>
        task.run.pipe(
          Effect.exit,
          Effect.map((result) => ({ name: task.name, result })),
        ),
      { concurrency: 7 },
    )
    const failures = outcomes.flatMap(({ name, result }) =>
      Exit.isFailure(result) ? [{ task: name, cause: result.cause }] : [],
    )
    if (failures.length > 0) return yield* new MaintenanceError({ failures })
    return undefined
  })
}
