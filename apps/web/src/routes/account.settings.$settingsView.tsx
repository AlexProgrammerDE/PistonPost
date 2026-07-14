import { createFileRoute } from "@tanstack/react-router"

import { Settings } from "@/components/auth/settings/settings"
import { NotificationSettingsForm, ProfileSettingsForm } from "@/components/product-settings"
import { getMyProductSettings } from "@/server/settings"

export const Route = createFileRoute("/account/settings/$settingsView")({
  loader: ({ params }) =>
    params.settingsView === "profile" || params.settingsView === "notifications"
      ? getMyProductSettings()
      : null,
  component: SettingsView,
  head: () => ({ meta: [{ title: "Account settings | PistonPost" }] }),
})

function SettingsView() {
  const { settingsView } = Route.useParams()
  const productSettings = Route.useLoaderData()
  if (settingsView === "profile" && productSettings) {
    return <ProfileSettingsForm settings={productSettings} />
  }
  if (settingsView === "notifications" && productSettings) {
    return <NotificationSettingsForm settings={productSettings} />
  }
  return <Settings path={settingsView} />
}
