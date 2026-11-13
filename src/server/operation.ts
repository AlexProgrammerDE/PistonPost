import { Data, Effect } from "effect"

export class OperationError extends Data.TaggedError("OperationError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** An executing binding operation must settle before its owner can finish. */
export function bindingOperation<A>(operation: string, task: () => A | PromiseLike<A>) {
  return Effect.tryPromise({
    try: async () => task(),
    catch: (cause) => new OperationError({ operation, cause }),
  }).pipe(Effect.uninterruptible)
}
