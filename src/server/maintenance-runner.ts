import { Effect, Exit, Schema } from "effect"

export class MaintenanceError extends Schema.TaggedError<
  MaintenanceError,
  { readonly brand: unique symbol }
>()("MaintenanceError", {
  failures: Schema.Array(
    Schema.Struct({ task: Schema.String, cause: Schema.Cause(Schema.Unknown, Schema.Unknown) }),
  ),
}) {}

/** A failed maintenance task must not interrupt independent cleanup work. */
export function runMaintenanceTasks<E, R>(
  tasks: readonly {
    readonly name: string
    readonly run: Effect.Effect<void, E, R>
  }[],
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
    if (failures.length > 0) return yield* MaintenanceError.make({ failures })
    return undefined
  })
}
