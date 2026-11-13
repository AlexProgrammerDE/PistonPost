import { describe, expect, test } from "bun:test"

import { Schema, Effect } from "effect"

import {
  parseServerFunctionError,
  serverFunctionErrorStatus,
  serverFunctionValidator,
  toServerFunctionClientError,
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
