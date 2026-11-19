import { describe, expect, it } from "bun:test"

import { viewPaths } from "@better-auth-ui/core"

import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin"
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin"

import { getAuthViewLabel, validAuthPathSegments } from "./auth-ui-metadata"

describe("auth route paths", () => {
  it("accepts every Better Auth UI and enabled plugin path", () => {
    const expectedPaths = [
      ...Object.values({ ...viewPaths.auth }).filter((path: unknown) => typeof path === "string"),
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

describe("auth view labels", () => {
  it("names every auth view instead of falling back to the generic label", () => {
    for (const path of validAuthPathSegments) {
      expect(getAuthViewLabel(path)).not.toBe("Account access")
    }
  })

  it("matches the visible headings and actions", () => {
    expect(getAuthViewLabel(viewPaths.auth.signUp)).toBe("Sign up")
    expect(getAuthViewLabel(viewPaths.auth.forgotPassword)).toBe("Forgot password")
    expect(getAuthViewLabel(viewPaths.auth.resetPassword)).toBe("Reset password")
  })

  it("uses the generic label for unknown paths", () => {
    expect(getAuthViewLabel("unknown")).toBe("Account access")
  })
})
