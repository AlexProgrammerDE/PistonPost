import { viewPaths } from "@better-auth-ui/core"

const productSettingsPathSegments = {
  profile: "profile",
  notifications: "notifications",
} as const

export const validSettingsPathSegments = new Set([
  ...Object.values(viewPaths.settings),
  ...Object.values(productSettingsPathSegments),
])

export const settingsViews = [
  { value: productSettingsPathSegments.profile, label: "Profile" },
  { value: viewPaths.settings.account, label: "Account" },
  { value: viewPaths.settings.security, label: "Security" },
  { value: productSettingsPathSegments.notifications, label: "Notifications" },
] as const
