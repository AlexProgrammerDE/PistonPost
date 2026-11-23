import { describe, expect, test } from "bun:test"

import { withAuthReturnRedirect } from "./auth-return-redirect"

const post = { pathname: "/post/abc", searchStr: "?image=2" }

describe("withAuthReturnRedirect", () => {
  test("sends sign-in from a content page back to that page", () => {
    expect(withAuthReturnRedirect("/auth/sign-in", post)).toBe(
      "/auth/sign-in?redirectTo=%2Fpost%2Fabc%3Fimage%3D2",
    )
  })

  test("keeps the original destination when switching from sign-in to sign-up", () => {
    const signIn = { pathname: "/auth/sign-in", searchStr: "?redirectTo=%2Ftag%2Fart" }
    expect(withAuthReturnRedirect("/auth/sign-up", signIn)).toBe(
      "/auth/sign-up?redirectTo=%2Ftag%2Fart",
    )
  })

  test("keeps the original destination through an email-code password reset", () => {
    const forgotPassword = {
      pathname: "/auth/forgot-password",
      searchStr: "?redirectTo=%2Fpost%2Fabc",
    }
    const resetPath = withAuthReturnRedirect("/auth/reset-password", forgotPassword)
    expect(resetPath).toBe("/auth/reset-password?redirectTo=%2Fpost%2Fabc")

    const resetPassword = {
      pathname: "/auth/reset-password",
      searchStr: "?redirectTo=%2Fpost%2Fabc",
    }
    expect(withAuthReturnRedirect("/auth/sign-in", resetPassword)).toBe(
      "/auth/sign-in?redirectTo=%2Fpost%2Fabc",
    )
  })

  test("leaves links alone when there is nowhere useful to return", () => {
    expect(withAuthReturnRedirect("/auth/sign-in", { pathname: "/", searchStr: "" })).toBe(
      "/auth/sign-in",
    )
    expect(
      withAuthReturnRedirect("/auth/sign-up", { pathname: "/auth/sign-in", searchStr: "" }),
    ).toBe("/auth/sign-up")
  })

  test("does not override an explicit destination or touch other links", () => {
    expect(withAuthReturnRedirect("/auth/sign-in?redirectTo=%2Fsettings", post)).toBe(
      "/auth/sign-in?redirectTo=%2Fsettings",
    )
    expect(withAuthReturnRedirect("/auth/sign-out", post)).toBe("/auth/sign-out")
    expect(withAuthReturnRedirect("/settings/account", post)).toBe("/settings/account")
  })

  test("ignores an unsafe destination from the current auth page", () => {
    const hostile = { pathname: "/auth/sign-in", searchStr: "?redirectTo=https%3A%2F%2Fevil.test" }
    expect(withAuthReturnRedirect("/auth/sign-up", hostile)).toBe("/auth/sign-up")
  })
})
