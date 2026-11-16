import { describe, expect, test } from "bun:test"

import { isNotFound, isRedirect } from "@tanstack/react-router"

import { ownedRouteFailure } from "./owned-route-failure"
import { ServerFunctionClientError } from "./server-function-error"

describe("ownedRouteFailure", () => {
  test("sends a signed-out visitor to sign-in and back to the page", () => {
    const failure = ownedRouteFailure(
      { code: "UNAUTHENTICATED", message: "Sign in to continue." },
      "/post/abc/edit",
    )
    expect(isRedirect(failure)).toBe(true)
    expect(JSON.stringify(failure)).toContain("/post/abc/edit")
  })

  test.each([
    ["missing", { code: "NOT_FOUND" as const, message: "The post was not found." }],
    ["someone else's", { code: "FORBIDDEN" as const, message: "Not yours." }],
  ])("shows not found for a %s item, from the server or the browser", (_case, details) => {
    expect(isNotFound(ownedRouteFailure(details, "/post/abc/edit"))).toBe(true)
    expect(
      isNotFound(ownedRouteFailure(new ServerFunctionClientError(details), "/post/abc/edit")),
    ).toBe(true)
  })

  test("passes other failures through", () => {
    const failure = new TypeError("Failed to fetch")
    expect(ownedRouteFailure(failure, "/post/abc/edit")).toBe(failure)
  })
})
