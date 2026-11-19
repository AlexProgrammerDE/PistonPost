import { Cause, Effect, Exit, Option, Predicate, Schema } from "effect"

import { OperationError } from "./operation"
import { OutboxRepository, outboxRetryDelayMs } from "./outbox-repository"

export class QueueDeliveryError extends Schema.TaggedError<
  QueueDeliveryError,
  { readonly brand: unique symbol }
>()("QueueDeliveryError", { operation: Schema.String, retryAfterSeconds: Schema.Finite }) {}

export function queueFailure(operation: string, retryAfterSeconds = 30) {
  return () => QueueDeliveryError.make({ operation, retryAfterSeconds })
}

function errorCode(error: unknown) {
  if (error instanceof OperationError) return error.operation
  const tag = Predicate.hasProperty(error, "_tag") ? Reflect.get(error, "_tag") : undefined
  return typeof tag === "string" ? tag : "UnknownError"
}

/** A submitted delivery and its durable settlement share the claim's lifetime. */
export function withOutboxClaim<A, E, R>(
  job: { idempotencyKey: string; type: string },
  use: (claim: { attempt: number }) => Effect.Effect<A, E, R>,
) {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const outbox = yield* OutboxRepository
      yield* outbox.ensure(job.idempotencyKey, job.type, job)
      const claim = yield* outbox.claim(job.idempotencyKey)
      if (Predicate.isTagged(claim, "Deferred")) {
        return yield* QueueDeliveryError.make({
          operation: "outbox-deferred",
          retryAfterSeconds: claim.retryAfterSeconds,
        })
      }
      if (!Predicate.isTagged(claim, "Claimed")) return undefined
      // The outbox row and the queue message must wait the same time, or the queue spends its
      // retries while the row is still unavailable and dead-letters the job early.
      const retryDelayMs = (error: unknown) =>
        Math.max(
          outboxRetryDelayMs(claim.attempt),
          error instanceof QueueDeliveryError ? error.retryAfterSeconds * 1000 : 0,
        )
      return yield* restore(use(claim)).pipe(
        Effect.onExit((exit) => {
          if (Exit.isSuccess(exit)) return Effect.void
          const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
          return outbox.release(
            job.idempotencyKey,
            claim.attempt,
            errorCode(error),
            retryDelayMs(error),
          )
        }),
        Effect.mapError((error) =>
          QueueDeliveryError.make({
            operation: error instanceof QueueDeliveryError ? error.operation : errorCode(error),
            retryAfterSeconds: Math.ceil(retryDelayMs(error) / 1000),
          }),
        ),
      )
    }),
  )
}
