import { describe, expect, it } from "bun:test"

import { authSearchSchema, safeLocalRedirect } from "./local-redirect"

describe("safeLocalRedirect", () => {
  it("preserves local paths with search and hash values", () => {
    expect(safeLocalRedirect("/account/settings/security?panel=sessions#current")).toBe(
      "/account/settings/security?panel=sessions#current",
    )
  })

  it("normalizes local paths without accepting another origin", () => {
    expect(safeLocalRedirect("/following/../account/posts")).toBe("/account/posts")
    expect(safeLocalRedirect("https://example.com/account/settings")).toBeUndefined()
    expect(safeLocalRedirect("//example.com/account/settings")).toBeUndefined()
    expect(safeLocalRedirect("/\\example.com/account/settings")).toBeUndefined()
  })

  it("rejects auth loops and malformed values", () => {
    expect(safeLocalRedirect("/auth/sign-in")).toBeUndefined()
    expect(safeLocalRedirect(123)).toBeUndefined()
    expect(safeLocalRedirect("/".repeat(2049))).toBeUndefined()
  })

  it("drops invalid redirect search values", () => {
    expect(authSearchSchema.parse({ redirectTo: "https://example.com" })).toEqual({
      redirectTo: undefined,
    })
    expect(authSearchSchema.parse({ redirectTo: ["/account", "//example.com"] })).toEqual({
      redirectTo: undefined,
    })
  })
})
