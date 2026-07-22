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

  it("drops invalid redirect search values", () => {
    expect(authSearchSchema.parse({ redirectTo: "https://example.com" })).toEqual({
      redirectTo: undefined,
    })
    expect(authSearchSchema.parse({ redirectTo: ["/settings", "//example.com"] })).toEqual({
      redirectTo: undefined,
    })
  })
})
