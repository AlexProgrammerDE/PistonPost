import { describe, expect, test } from "bun:test"

import { Schema, Effect } from "effect"

import {
  parseServerFunctionError,
  serverFunctionErrorStatus,
  ServerFunctionClientError,
  serverFunctionValidator,
  shouldRetryQuery,
  toServerFunctionClientError,
  userFacingServerMessage,
} from "./server-function-error"

describe("server function error contract", () => {
  test("parses stable wire errors and assigns their HTTP status", () => {
    const error = parseServerFunctionError({
      code: "RATE_LIMITED",
      message: "Wait before trying again.",
      retryAfterSeconds: 30,
    })

    expect(error).not.toBeNull()
    if (!error) return
    expect(error.code).toBe("RATE_LIMITED")
    expect(serverFunctionErrorStatus(error)).toBe(429)
  })

  test("rejects values outside the public wire contract", () => {
    expect(parseServerFunctionError(new Error("database details"))).toBeNull()
    expect(parseServerFunctionError({ code: "INTERNAL_ERROR", message: "Failed" })).toBeNull()
  })

  test("restores a normal Error for existing client rejection flows", () => {
    const error = toServerFunctionClientError({
      code: "CONFLICT",
      message: "The post changed in another session.",
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.code).toBe("CONFLICT")
    expect(error?.message).toBe("The post changed in another session.")
  })

  test("keeps schema defaults and structured failures at the input boundary", () => {
    const validate = serverFunctionValidator(
      Schema.Struct({
        limit: Schema.Finite.check(Schema.isInt())
          .check(Schema.isGreaterThanOrEqualTo(1))
          .pipe(Schema.withDecodingDefaultType(Effect.succeed(12))),
      }),
    )

    expect(validate({})).toEqual({ limit: 12 })
    expect(() => validate({ limit: 0 })).toThrow(Schema.SchemaError)
  })
})

describe("query retry policy", () => {
  test("does not retry declared client errors", () => {
    const invalidCursor = new ServerFunctionClientError({
      code: "INVALID_INPUT",
      message: "The pagination cursor is invalid.",
      issues: [],
    })
    const rateLimited = new ServerFunctionClientError({
      code: "RATE_LIMITED",
      message: "Wait before trying again.",
      retryAfterSeconds: 30,
    })

    expect(shouldRetryQuery(0, invalidCursor)).toBe(false)
    expect(shouldRetryQuery(0, rateLimited)).toBe(false)
  })

  test("retries internal and network errors up to three times", () => {
    const internal = new ServerFunctionClientError({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Try again.",
      requestId: crypto.randomUUID(),
    })

    expect(shouldRetryQuery(0, internal)).toBe(true)
    expect(shouldRetryQuery(2, new TypeError("Failed to fetch"))).toBe(true)
    expect(shouldRetryQuery(3, new TypeError("Failed to fetch"))).toBe(false)
  })
})

describe("user-facing server messages", () => {
  test("shows declared messages, such as a rate limit, to the user", () => {
    const rateLimited = new ServerFunctionClientError({
      code: "RATE_LIMITED",
      message: "You're commenting too fast. Wait a minute and try again.",
      retryAfterSeconds: 60,
    })
    expect(userFacingServerMessage(rateLimited)).toBe(
      "You're commenting too fast. Wait a minute and try again.",
    )
  })

  test("leaves internal failures and network errors to the caller's fallback", () => {
    const internal = new ServerFunctionClientError({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Try again.",
      requestId: crypto.randomUUID(),
    })
    expect(userFacingServerMessage(internal)).toBeUndefined()
    expect(userFacingServerMessage(new TypeError("Failed to fetch"))).toBeUndefined()
  })
})
