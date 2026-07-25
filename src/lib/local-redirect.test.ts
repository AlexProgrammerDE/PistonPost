import { describe, expect, it } from "bun:test"

import { authSearchSchema, safeLocalRedirect } from "./local-redirect"

describe("safeLocalRedirect", () => {
  it("preserves local paths with search and hash values", () => {
    expect(safeLocalRedirect("/settings/security?panel=sessions#current")).toBe(
      "/settings/security?panel=sessions#current",
    )
  })

  it("normalizes local paths without accepting another origin", () => {
    expect(safeLocalRedirect("/following/../posts")).toBe("/posts")
    expect(safeLocalRedirect("https://example.com/settings")).toBeUndefined()
    expect(safeLocalRedirect("//example.com/settings")).toBeUndefined()
    expect(safeLocalRedirect("/\\example.com/settings")).toBeUndefined()
  })

  it("rejects auth loops and malformed values", () => {
    expect(safeLocalRedirect("/auth/sign-in")).toBeUndefined()
    expect(safeLocalRedirect(123)).toBeUndefined()
    expect(safeLocalRedirect("/".repeat(2049))).toBeUndefined()
  })

  it("allows one validated handoff through the authenticated redirect view", () => {
    const callback = "/api/auth/delete-user/callback?token=secret&callbackURL=%2F"
    const handoff = `/auth/redirect?${new URLSearchParams({ redirectTo: callback })}`

    expect(safeLocalRedirect(handoff)).toBe(handoff)
    expect(safeLocalRedirect("/auth/redirect")).toBeUndefined()
    expect(
      safeLocalRedirect(
        `/auth/redirect?${new URLSearchParams({
          redirectTo: "/auth/redirect?redirectTo=%2Fsettings",
        })}`,
      ),
    ).toBeUndefined()
    expect(
      safeLocalRedirect(
        `/auth/redirect?${new URLSearchParams({
          redirectTo: "https://example.com/settings",
        })}`,
      ),
    ).toBeUndefined()
  })

  it("drops invalid redirect search values", () => {
    expect(authSearchSchema.parse({ redirectTo: "https://example.com" })).toEqual({
      redirectTo: undefined,
    })
    expect(authSearchSchema.parse({ redirectTo: ["/settings", "//example.com"] })).toEqual({
      redirectTo: undefined,
    })
  })
})
