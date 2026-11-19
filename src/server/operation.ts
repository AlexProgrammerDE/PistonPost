import { Effect, Schema } from "effect"

export class OperationError extends Schema.TaggedError<
  OperationError,
  { readonly brand: unique symbol }
>()("OperationError", { operation: Schema.String, cause: Schema.Unknown }) {}

/** An executing binding operation must settle before its owner can finish. */
export function bindingOperation<A>(operation: string, task: () => A | PromiseLike<A>) {
  return Effect.tryPromise({
    try: async () => task(),
    catch: (cause) => new OperationError({ operation, cause }),
  }).pipe(Effect.uninterruptible)
}
