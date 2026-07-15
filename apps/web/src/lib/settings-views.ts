export const settingsViews = [
  { value: "profile", label: "Profile" },
  { value: "account", label: "Account" },
  { value: "security", label: "Security" },
  { value: "appearance", label: "Appearance" },
  { value: "notifications", label: "Notifications" },
  { value: "danger", label: "Danger Zone" },
] as const

export type SettingsView = (typeof settingsViews)[number]["value"]

export function isSettingsView(value: string): value is SettingsView {
  return settingsViews.some((view) => view.value === value)
}
