import { createFileRoute, notFound } from "@tanstack/react-router"

import { Settings } from "@/components/auth/settings/settings"
import { SettingsPanelSkeleton } from "@/components/LoadingStates"
import { NotificationSettingsForm, ProfileSettingsForm } from "@/components/product-settings"
import { settingsViews, validSettingsPathSegments } from "@/lib/settings-views"
import { getMyProductSettings } from "@/server/settings"

export const Route = createFileRoute("/settings/$settingsView")({
  beforeLoad: ({ params }) => {
    if (!validSettingsPathSegments.has(params.settingsView)) throw notFound()
  },
  loader: ({ params }) =>
    params.settingsView === "profile" || params.settingsView === "notifications"
      ? getMyProductSettings()
      : null,
  component: SettingsView,
  pendingComponent: SettingsPanelSkeleton,
  // Each tab is its own route, so name it in the title to confirm the change to screen readers.
  head: ({ params }) => {
    const view = settingsViews.find((candidate) => candidate.value === params.settingsView)
    return {
      meta: [{ title: `${view ? `${view.label} settings` : "Settings"} · PistonPost` }],
    }
  },
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
  return <Settings path={settingsView} hideNav />
}
