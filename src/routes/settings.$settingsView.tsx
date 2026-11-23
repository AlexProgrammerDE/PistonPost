import { createFileRoute, notFound, rootRouteId, useLoaderData } from "@tanstack/react-router"
import { Activity } from "lucide-react"

import { Settings } from "@/components/auth/settings/settings"
import { SettingsPanelSkeleton } from "@/components/LoadingStates"
import { NotificationSettingsForm, ProfileSettingsForm } from "@/components/product-settings"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  accountActivitySettingsView,
  settingsViews,
  validSettingsPathSegments,
} from "@/lib/settings-views"
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
  const { accountActivity } = useLoaderData({ from: rootRouteId })
  if (settingsView === accountActivitySettingsView && !accountActivity) {
    return <AccountActivityUnavailable />
  }
  if (settingsView === "profile" && productSettings) {
    return <ProfileSettingsForm settings={productSettings} />
  }
  if (settingsView === "notifications" && productSettings) {
    return <NotificationSettingsForm settings={productSettings} />
  }
  return <Settings path={settingsView} hideNav />
}

// The activity log lives in the hosted Better Auth service. Without it, keep old links working.
function AccountActivityUnavailable() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Activity />
        </EmptyMedia>
        <EmptyTitle>Activity is not available here</EmptyTitle>
        <EmptyDescription>
          This server does not keep a sign-in activity log. Your sessions and devices are still on
          the Security tab.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
