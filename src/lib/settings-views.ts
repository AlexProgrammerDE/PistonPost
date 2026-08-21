import { viewPaths } from "@better-auth-ui/core"
import { dashPlugin } from "@better-auth-ui/core/plugins/dash"

const dashSettingsPathSegment = dashPlugin({ organization: false }).viewPaths.settings.activity

const productSettingsPathSegments = {
  profile: "profile",
  notifications: "notifications",
} as const

export const validSettingsPathSegments = new Set([
  ...Object.values(viewPaths.settings),
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
