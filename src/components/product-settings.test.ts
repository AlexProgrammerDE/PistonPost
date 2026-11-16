import { describe, expect, test } from "bun:test"

import { ServerFunctionClientError } from "@/lib/server-function-error"

import { profileSaveErrorMessage } from "./product-settings"

describe("profile save errors", () => {
  test("shows the server reason for a taken username", () => {
    const error = new ServerFunctionClientError({
      code: "CONFLICT",
      message: "That username is already in use.",
    })

    expect(profileSaveErrorMessage(error)).toBe("That username is already in use.")
  })

  test("hides internal and unknown failures behind a generic message", () => {
    const internal = new ServerFunctionClientError({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Try again.",
      requestId: "8f14e45f-ceea-467f-a0e6-8c5b0b1c7e4d",
    })
    const generic = "Your profile could not be saved. Check the fields and try again."

    expect(profileSaveErrorMessage(internal)).toBe(generic)
    expect(profileSaveErrorMessage(new Error("network down"))).toBe(generic)
  })
})
