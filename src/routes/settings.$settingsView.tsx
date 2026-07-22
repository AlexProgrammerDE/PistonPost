import { createFileRoute, notFound } from "@tanstack/react-router"

import { Settings } from "@/components/auth/settings/settings"
import { SettingsPanelSkeleton } from "@/components/LoadingStates"
import { NotificationSettingsForm, ProfileSettingsForm } from "@/components/product-settings"
import { authSettingsViewPaths } from "@/lib/auth-ui-metadata"
import { isSettingsView } from "@/lib/settings-views"
import { getMyProductSettings } from "@/server/settings"

export const Route = createFileRoute("/settings/$settingsView")({
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
  if (
    settingsView === authSettingsViewPaths.account ||
    settingsView === authSettingsViewPaths.security
  ) {
    return <Settings path={settingsView} hideNav />
  }
  throw notFound()
}
