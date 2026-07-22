import { describe, expect, test } from "bun:test"

import { z } from "zod"

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

  test("keeps Zod defaults and structured failures at the input boundary", () => {
    const validate = serverFunctionValidator(
      z.object({ limit: z.number().int().min(1).default(12) }),
    )

    expect(validate({})).toEqual({ limit: 12 })
    expect(() => validate({ limit: 0 })).toThrow(z.ZodError)
  })
})
