import { describe, expect, it } from "bun:test"

import { viewPaths } from "@better-auth-ui/core"

import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin"

import { validAuthPathSegments } from "./auth-ui-metadata"

describe("auth route paths", () => {
  it("accepts every Better Auth UI and enabled plugin path", () => {
    const expectedPaths = [
      ...Object.values(viewPaths.auth),
      ...Object.values(magicLinkPlugin().viewPaths.auth),
    ]

    expect(validAuthPathSegments).toEqual(new Set(expectedPaths))
    expect(expectedPaths.every((path) => validAuthPathSegments.has(path))).toBe(true)
  })

  it("rejects unknown auth paths", () => {
    expect(validAuthPathSegments.has("unknown")).toBe(false)
  })
})
