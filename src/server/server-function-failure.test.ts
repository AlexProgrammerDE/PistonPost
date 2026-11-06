import { describe, expect, test } from "bun:test"

import { Effect, Schema, Result } from "effect"

import { InvalidCursorError, NotFoundError, RepositoryError } from "@/domain/errors"

import {
  normalizeServerFunctionFailure,
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
      runServerEffect(Effect.fail(InvalidCursorError.make({ reason: "bad encoding" }))),
    )
    const missingFailure = await rejectedValue(
      runServerEffect(Effect.fail(NotFoundError.make({ entity: "post", id: "post-1" }))),
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
    const failure = await rejectedValue(runServerEffect(Effect.fail(cause)))

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
