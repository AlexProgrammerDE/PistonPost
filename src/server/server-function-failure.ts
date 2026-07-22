import { Data, Effect, Either } from "effect"
import { z } from "zod"

import {
  AuthorizationError,
  ConflictError,
  InvalidCursorError,
  NotFoundError,
  RepositoryError,
} from "@/domain/errors"
import { UnsubscribeTokenError } from "@/email/unsubscribe"
import {
  parseServerFunctionError,
  ServerFunctionClientError,
  type ServerFunctionError,
} from "@/lib/server-function-error"
import { HUMAN_VERIFICATION_ERROR_MESSAGE } from "@/lib/turnstile"
import { StreamDirectUploadError } from "@/server/stream-direct-upload"
import { TurnstileVerificationError } from "@/server/turnstile"

export class ServerFunctionFailure extends Data.TaggedError("ServerFunctionFailure")<{
  readonly error: ServerFunctionError
  readonly cause: unknown
}> {}

function failure(error: ServerFunctionError, cause: unknown = error) {
  return new ServerFunctionFailure({ error, cause })
}

export function invalidInputFailure(message: string, issues: ServerFunctionErrorIssues = []) {
  return failure({ code: "INVALID_INPUT", message, issues })
}

export function unauthenticatedFailure(message = "Sign in to continue.") {
  return failure({ code: "UNAUTHENTICATED", message })
}

export function forbiddenFailure(message = "You do not have permission to do that.") {
  return failure({ code: "FORBIDDEN", message })
}

export function notFoundFailure(message: string) {
  return failure({ code: "NOT_FOUND", message })
}

export function conflictFailure(message: string) {
  return failure({ code: "CONFLICT", message })
}

export function rateLimitedFailure(message: string, retryAfterSeconds = 60) {
  return failure({ code: "RATE_LIMITED", message, retryAfterSeconds })
}

export function internalFailure(cause: unknown, message = "Something went wrong. Try again.") {
  return failure(
    {
      code: "INTERNAL_ERROR",
      message,
      requestId: crypto.randomUUID(),
    },
    cause,
  )
}

type ServerFunctionErrorIssues = Array<{
  readonly path: string
  readonly message: string
}>

function zodIssues(error: z.ZodError): ServerFunctionErrorIssues {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message.slice(0, 500),
  }))
}

export function normalizeServerFunctionFailure(cause: unknown) {
  if (cause instanceof ServerFunctionFailure) return cause
  if (cause instanceof ServerFunctionClientError) return failure(cause.details, cause)
  const wireError = parseServerFunctionError(cause)
  if (wireError) return failure(wireError, cause)
  if (cause instanceof z.ZodError) {
    return invalidInputFailure("Check the submitted values.", zodIssues(cause))
  }
  return internalFailure(cause)
}

export function mapEffectFailure(cause: unknown) {
  if (cause instanceof AuthorizationError) {
    return cause.reason === "Authentication is required for this action."
      ? unauthenticatedFailure()
      : forbiddenFailure(cause.reason)
  }
  if (cause instanceof NotFoundError) {
    return notFoundFailure(`The ${cause.entity} was not found.`)
  }
  if (cause instanceof InvalidCursorError) {
    return invalidInputFailure("The pagination cursor is invalid.")
  }
  if (cause instanceof ConflictError) {
    return conflictFailure(`The ${cause.entity} changed in another session.`)
  }
  if (cause instanceof TurnstileVerificationError) {
    return cause.reason === "rejected"
      ? invalidInputFailure(HUMAN_VERIFICATION_ERROR_MESSAGE)
      : internalFailure(cause)
  }
  if (cause instanceof StreamDirectUploadError) {
    return internalFailure(cause, "The video upload could not be started. Try again.")
  }
  if (cause instanceof UnsubscribeTokenError) {
    return cause.message.startsWith("The link")
      ? invalidInputFailure(cause.message)
      : internalFailure(cause)
  }
  if (cause instanceof RepositoryError) return internalFailure(cause)
  return internalFailure(cause)
}

export async function runServerEffect<Success, Failure>(effect: Effect.Effect<Success, Failure>) {
  const result = await Effect.runPromise(Effect.either(effect))
  if (Either.isLeft(result)) throw mapEffectFailure(result.left)
  return result.right
}
