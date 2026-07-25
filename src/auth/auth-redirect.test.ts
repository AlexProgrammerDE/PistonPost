import { describe, expect, it } from "bun:test"

import { createAuthRedirectUrl } from "./auth-redirect"

describe("createAuthRedirectUrl", () => {
  it("wraps a same-origin callback in the BAUI authenticated redirect view", () => {
    const result = new URL(
      createAuthRedirectUrl(
        "https://post.example",
        "https://post.example/api/auth/delete-user/callback?token=secret&callbackURL=%2F",
      ),
    )

    expect(result.origin).toBe("https://post.example")
    expect(result.pathname).toBe("/auth/redirect")
    expect(result.searchParams.get("redirectTo")).toBe(
      "/api/auth/delete-user/callback?token=secret&callbackURL=%2F",
    )
  })

  it("rejects callbacks on another origin", () => {
    expect(() =>
      createAuthRedirectUrl(
        "https://post.example",
        "https://attacker.example/api/auth/delete-user/callback?token=secret",
      ),
    ).toThrow("Better Auth callback URLs must use the application origin.")
  })
})
