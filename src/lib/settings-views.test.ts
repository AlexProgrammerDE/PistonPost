import { describe, expect, it } from "bun:test"

import { viewPaths } from "@better-auth-ui/core"
import { dashPlugin } from "@better-auth-ui/core/plugins/dash"

import { validSettingsPathSegments } from "./settings-views"

describe("settings route paths", () => {
  it("accepts every Better Auth UI and product settings path", () => {
    const dashActivityPath = dashPlugin({ organization: false }).viewPaths.settings.activity
    const expectedPaths = [
      ...Object.values(viewPaths.settings),
      dashActivityPath,
      "profile",
      "notifications",
    ]

    expect(validSettingsPathSegments).toEqual(new Set(expectedPaths))
    expect(expectedPaths.every((path) => validSettingsPathSegments.has(path))).toBe(true)
  })

  it("rejects unknown settings paths", () => {
    expect(validSettingsPathSegments.has("unknown")).toBe(false)
  })
})
