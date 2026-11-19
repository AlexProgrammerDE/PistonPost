import { describe, expect, test } from "bun:test"

import { Effect, Schema, Result } from "effect"

import { InvalidCursorError, NotFoundError, RepositoryError } from "@/domain/errors"

import { bindingOperation, OperationError } from "./operation"
import {
  conflictFailure,
  normalizeServerFunctionFailure,
  publicServerFunctionError,
  runServerEffect,
  ServerFunctionFailure,
} from "./server-function-failure"

async function rejectedValue(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (cause: unknown) => cause,
  )
}

describe("server function failure mapping", () => {
  test("maps expected Effect failures to the public wire contract", async () => {
    const cursorFailure = await rejectedValue(
      Effect.fail(InvalidCursorError.make({ reason: "bad encoding" })).pipe(runServerEffect),
    )
    const missingFailure = await rejectedValue(
      Effect.fail(NotFoundError.make({ entity: "post", id: "post-1" })).pipe(runServerEffect),
    )

    expect(cursorFailure).toMatchObject({
      _tag: "ServerFunctionFailure",
      error: { code: "INVALID_INPUT" },
    })
    expect(missingFailure).toMatchObject({
      _tag: "ServerFunctionFailure",
      error: { code: "NOT_FOUND" },
    })
  })

  test("keeps repository failures private", async () => {
    const cause = RepositoryError.make({ operation: "read secret row", message: "SQL text" })
    const failure = await rejectedValue(Effect.fail(cause).pipe(runServerEffect))

    expect(failure).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Try again.",
      },
    })
  })

  test("normalizes validation errors without exposing unrelated defects", () => {
    const parsed = Schema.decodeResult(
      Schema.Struct({
        title: Schema.String.check(Schema.isMinLength(1, { message: "Add a title." })),
        text: Schema.String.check(Schema.isMinLength(1, { message: "Add some text." })),
      }),
      { errors: "all" },
    )({ title: "", text: "" })
    expect(Result.isSuccess(parsed)).toBeFalse()
    if (Result.isSuccess(parsed)) return

    const validation = normalizeServerFunctionFailure(parsed.failure)
    const defect = normalizeServerFunctionFailure(new Error("private database error"))

    expect(validation.error).toEqual({
      code: "INVALID_INPUT",
      message: "Check the submitted values.",
      issues: [
        { path: "title", message: "Add a title." },
        { path: "text", message: "Add some text." },
      ],
    })
    expect(defect).toBeInstanceOf(ServerFunctionFailure)
    expect(defect.error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Try again.",
    })
    expect(defect.error.message).not.toContain("database")
  })
})

test("preserves composed application failures and hides operational causes", async () => {
  const expected = conflictFailure("The draft changed in another session.")
  expect(await rejectedValue(Effect.fail(expected).pipe(runServerEffect))).toBe(expected)
  const privateFailure = await rejectedValue(
    bindingOperation("save-draft", () => Promise.reject(new Error("private database detail"))).pipe(
      runServerEffect,
    ),
  )
  expect(privateFailure).toMatchObject({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again." },
  })
  expect(JSON.stringify((privateFailure as ServerFunctionFailure).error)).not.toContain(
    "private database detail",
  )
})

test("the public middleware envelope strips causes before error serialization", () => {
  const cause = OperationError.make({
    operation: "write",
    cause: { sql: "private SQL text", providerToken: "private-token" },
  })
  const publicError = publicServerFunctionError(cause)
  expect(publicError).not.toBeInstanceOf(Error)
  expect(publicError).toEqual({
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Try again.",
    requestId: expect.any(String),
  })
  expect(new Set(Reflect.ownKeys(publicError))).toEqual(new Set(["code", "message", "requestId"]))
  expect(JSON.stringify(publicError)).not.toContain("private")
  const expected = conflictFailure("The draft changed in another session.")
  Object.assign(expected.error, { cause, debug: "private SQL text" })
  expect(expected.pipe(publicServerFunctionError)).toEqual({
    code: "CONFLICT",
    message: "The draft changed in another session.",
  })
  expect(expected.error).toHaveProperty("cause", cause)
})
