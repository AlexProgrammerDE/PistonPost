import { Cause, Effect, Exit, Option, Predicate, Schema } from "effect"

import { OperationError } from "./operation"
import { OutboxRepository, outboxRetryDelayMs } from "./outbox-repository"

export class QueueDeliveryError extends Schema.TaggedError<QueueDeliveryError>()(
  "QueueDeliveryError",
  { operation: Schema.String, retryAfterSeconds: Schema.Finite },
) {}

export function queueFailure(operation: string, retryAfterSeconds = 30) {
  return () => new QueueDeliveryError({ operation, retryAfterSeconds })
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
        return yield* new QueueDeliveryError({
          operation: "outbox-deferred",
          retryAfterSeconds: claim.retryAfterSeconds,
        })
      }
      if (!Predicate.isTagged(claim, "Claimed")) return undefined
      return yield* restore(use(claim)).pipe(
        Effect.onExit((exit) => {
          if (Exit.isSuccess(exit)) return Effect.void
          const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
          return outbox.release(
            job.idempotencyKey,
            claim.attempt,
            errorCode(error),
            error instanceof QueueDeliveryError ? error.retryAfterSeconds * 1_000 : undefined,
          )
        }),
        Effect.mapError((error) =>
          error instanceof QueueDeliveryError
            ? error
            : new QueueDeliveryError({
                operation: errorCode(error),
                retryAfterSeconds: Math.ceil(outboxRetryDelayMs(claim.attempt) / 1_000),
              }),
        ),
      )
    }),
  )
}
