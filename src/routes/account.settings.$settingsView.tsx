import { createFileRoute, notFound } from "@tanstack/react-router"

import { DangerZone } from "@/components/auth/delete-user/danger-zone"
import { AccountSettings } from "@/components/auth/settings/account/account-settings"
import { SecuritySettings } from "@/components/auth/settings/security/security-settings"
import { Appearance } from "@/components/auth/theme/appearance"
import { SettingsPanelSkeleton } from "@/components/LoadingStates"
import { NotificationSettingsForm, ProfileSettingsForm } from "@/components/product-settings"
import { isSettingsView } from "@/lib/settings-views"
import { getMyProductSettings } from "@/server/settings"

export const Route = createFileRoute("/account/settings/$settingsView")({
  loader: ({ params }) =>
    params.settingsView === "profile" || params.settingsView === "notifications"
      ? getMyProductSettings()
      : null,
  component: SettingsView,
  pendingComponent: SettingsPanelSkeleton,
  head: () => ({ meta: [{ title: "Account settings | PistonPost" }] }),
})

function SettingsView() {
  const { settingsView } = Route.useParams()
  if (!isSettingsView(settingsView)) throw notFound()
  const productSettings = Route.useLoaderData()
  if (settingsView === "profile" && productSettings) {
    return <ProfileSettingsForm settings={productSettings} />
  }
  if (settingsView === "notifications" && productSettings) {
    return <NotificationSettingsForm settings={productSettings} />
  }
  if (settingsView === "account") return <AccountSettings />
  if (settingsView === "security") return <SecuritySettings />
  if (settingsView === "appearance") return <Appearance />
  if (settingsView === "danger") return <DangerZone />
  throw notFound()
}
