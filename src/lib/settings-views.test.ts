import { describe, expect, it } from "bun:test"

import { viewPaths } from "@better-auth-ui/core"
import { dashPlugin } from "@better-auth-ui/core/plugins/dash"

import { getVisibleSettingsViews, validSettingsPathSegments } from "./settings-views"

const visibleLabels = (accountActivity: boolean) =>
  getVisibleSettingsViews(accountActivity).map((view) => view.label)

describe("settings route paths", () => {
  it("accepts every Better Auth UI and product settings path", () => {
    const dashActivityPath = dashPlugin({ organization: false }).viewPaths.settings.activity
    const expectedPaths = [
      ...Object.values({ ...viewPaths.settings }).filter(
        (path: unknown) => typeof path === "string",
      ),
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

  it("hides the activity tab when account activity is unavailable", () => {
    expect(visibleLabels(true)).toEqual([
      "Profile",
      "Account",
      "Security",
      "Notifications",
      "Activity",
    ])
    expect(visibleLabels(false)).toEqual(["Profile", "Account", "Security", "Notifications"])
  })
})
