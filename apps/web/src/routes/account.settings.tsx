import { Outlet, createFileRoute } from "@tanstack/react-router"
import { Link, useLocation } from "@tanstack/react-router"

import { AuthenticationProvider } from "@/components/providers"
import { settingsViews } from "@/lib/settings-views"
import { getPublicRuntimeConfig } from "@/server/public-config"

export const Route = createFileRoute("/account/settings")({
  loader: () => getPublicRuntimeConfig(),
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: SettingsLayout,
})

function SettingsLayout() {
  const { queryClient } = Route.useRouteContext()
  const { turnstileSiteKey } = Route.useLoaderData()
  const location = useLocation()
  return (
    <AuthenticationProvider queryClient={queryClient} turnstileSiteKey={turnstileSiteKey}>
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-8 border-b pb-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight">Account settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage your profile, sign-in details, notifications, and account security.
          </p>
        </header>
        <nav className="mb-8 grid grid-cols-2 border-b sm:flex" aria-label="Account settings">
          {settingsViews.map((view) => {
            const active = location.pathname.endsWith(`/${view.value}`)
            return (
              <Link
                key={view.value}
                to="/account/settings/$settingsView"
                params={{ settingsView: view.value }}
                aria-current={active ? "page" : undefined}
                className="border-b-2 border-transparent px-3 py-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground sm:shrink-0 sm:text-left"
              >
                {view.label}
              </Link>
            )
          })}
        </nav>
        <div className="max-w-3xl">
          <Outlet />
        </div>
      </main>
    </AuthenticationProvider>
  )
}
