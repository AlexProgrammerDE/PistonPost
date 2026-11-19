import { viewPaths } from "@better-auth-ui/core"
import { dashPlugin } from "@better-auth-ui/core/plugins/dash"

const dashSettingsPathSegment = dashPlugin({ organization: false }).viewPaths.settings.activity

const productSettingsPathSegments = {
  profile: "profile",
  notifications: "notifications",
} as const

// Spreading the interface gives Object.values an index signature. Plugins add optional paths.
export const validSettingsPathSegments = new Set([
  ...Object.values({ ...viewPaths.settings }).filter((path: unknown) => typeof path === "string"),
  dashSettingsPathSegment,
  ...Object.values(productSettingsPathSegments),
])

export const settingsViews = [
  { value: productSettingsPathSegments.profile, label: "Profile" },
  { value: viewPaths.settings.account, label: "Account" },
  { value: viewPaths.settings.security, label: "Security" },
  { value: productSettingsPathSegments.notifications, label: "Notifications" },
  { value: dashSettingsPathSegment, label: "Activity" },
] as const
