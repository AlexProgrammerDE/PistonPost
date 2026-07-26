import { describe, expect, it } from "bun:test"

import { viewPaths } from "@better-auth-ui/core"

import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin"
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin"

import { validAuthPathSegments } from "./auth-ui-metadata"

describe("auth route paths", () => {
  it("accepts every Better Auth UI and enabled plugin path", () => {
    const expectedPaths = [
      ...Object.values(viewPaths.auth),
      ...Object.values(emailOtpPlugin().viewPaths.auth),
      ...Object.values(twoFactorPlugin().viewPaths.auth),
    ]

    expect(validAuthPathSegments).toEqual(new Set(expectedPaths))
    expect(expectedPaths.every((path) => validAuthPathSegments.has(path))).toBe(true)
  })

  it("rejects unknown and retired magic-link paths", () => {
    expect(validAuthPathSegments.has("unknown")).toBe(false)
    expect(validAuthPathSegments.has("magic-link")).toBe(false)
    expect(validAuthPathSegments.has("magic-link-sent")).toBe(false)
  })
})
