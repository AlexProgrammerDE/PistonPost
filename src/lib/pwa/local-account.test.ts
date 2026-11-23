import { describe, expect, it } from "bun:test"

import { knownLocalAccount } from "./local-account"

describe("knownLocalAccount", () => {
  it("waits while the session is loading", () => {
    expect(knownLocalAccount({ status: "pending", data: undefined })).toBeUndefined()
  })

  it("does not treat a failed session request as a sign-out", () => {
    // A 503, rate limit, or dropped connection must not clear the signed-in account's draft.
    expect(knownLocalAccount({ status: "error", data: undefined })).toBeUndefined()
    expect(knownLocalAccount({ status: "error", data: { user: { id: "user-a" } } })).toBeUndefined()
  })

  it("reports a confirmed sign-out", () => {
    expect(knownLocalAccount({ status: "success", data: null })).toBeNull()
  })

  it("reports the signed-in account", () => {
    expect(knownLocalAccount({ status: "success", data: { user: { id: "user-a" } } })).toBe(
      "user-a",
    )
  })
})
