import { authSettingsViewPaths } from "@/lib/auth-ui-metadata"

export const settingsViews = [
  { value: "profile", label: "Profile" },
  { value: authSettingsViewPaths.account, label: "Account" },
  { value: authSettingsViewPaths.security, label: "Security" },
  { value: "notifications", label: "Notifications" },
] as const

export type SettingsView = (typeof settingsViews)[number]["value"]

export function isSettingsView(value: string): value is SettingsView {
  return settingsViews.some((view) => view.value === value)
}
