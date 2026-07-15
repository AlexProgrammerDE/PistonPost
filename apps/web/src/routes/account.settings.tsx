import { Tabs, TabsList, TabsTrigger } from "@pistonpost/ui/components/tabs"
import { Outlet, createFileRoute } from "@tanstack/react-router"
import { Link, useLocation } from "@tanstack/react-router"

import { UserButton } from "@/components/auth/user/user-button"
import { AuthenticationProvider } from "@/components/providers"
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
  const activeView = location.pathname.split("/").at(-1) ?? "account"
  const views = ["profile", "account", "security", "appearance", "notifications"] as const
  return (
    <AuthenticationProvider queryClient={queryClient} turnstileSiteKey={turnstileSiteKey}>
      <main className="min-h-svh bg-muted/25">
        <header className="border-b bg-background">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
            <a href="/" className="font-heading text-lg font-extrabold tracking-[-0.04em]">
              piston<span className="text-primary">post</span>
            </a>
            <div className="flex items-center gap-3">
              <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
                Return to feed
              </a>
              <UserButton size="icon" align="end" />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="mb-9 border-b pb-7">
            <h1 className="font-heading text-3xl font-bold tracking-tight">Account settings</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Manage your public identity, sign-in methods, active sessions, and account data.
            </p>
          </div>
          <Tabs value={activeView} className="mb-8 overflow-x-auto">
            <TabsList variant="line">
              {views.map((view) => (
                <TabsTrigger
                  key={view}
                  value={view}
                  render={
                    <Link
                      to="/account/settings/$settingsView"
                      params={{ settingsView: view }}
                      className="capitalize"
                    />
                  }
                >
                  {view}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Outlet />
        </div>
      </main>
    </AuthenticationProvider>
  )
}
