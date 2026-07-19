import { authQueryKeys } from "@better-auth-ui/core"
import { ensureSession } from "@better-auth-ui/react"
import type { QueryClient } from "@tanstack/react-query"
import { Link, Outlet, createFileRoute, redirect, useLocation } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { Bell, KeyRound, ShieldCheck, UserRound } from "lucide-react"

import { authClient } from "@/auth/client"
import { SettingsLayoutSkeleton } from "@/components/LoadingStates"
import { settingsViews } from "@/lib/settings-views"
import { getCurrentSession } from "@/server/session"

const ensureSettingsSession = createIsomorphicFn()
  .server((queryClient: QueryClient) =>
    queryClient.ensureQueryData({
      queryKey: authQueryKeys.session,
      queryFn: () => getCurrentSession(),
    }),
  )
  .client((queryClient) => ensureSession(queryClient, authClient))

export const Route = createFileRoute("/account/settings")({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const session = await ensureSettingsSession(queryClient)
    if (!session) {
      throw redirect({
        to: "/auth/$authView",
        params: { authView: "sign-in" },
        search: { redirectTo: location.href },
      })
    }

    return { session }
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: SettingsLayout,
  pendingComponent: SettingsLayoutSkeleton,
})

function SettingsLayout() {
  const location = useLocation()

  return (
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
          const ViewIcon =
            view.value === "profile"
              ? UserRound
              : view.value === "notifications"
                ? Bell
                : view.value === "security"
                  ? ShieldCheck
                  : KeyRound
          return (
            <Link
              key={view.value}
              to="/account/settings/$settingsView"
              params={{ settingsView: view.value }}
              aria-current={active ? "page" : undefined}
              className="inline-flex items-center justify-center gap-1.5 border-b-2 border-transparent px-3 py-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground sm:shrink-0 sm:justify-start sm:text-left"
            >
              <ViewIcon aria-hidden="true" className="size-4" />
              {view.label}
            </Link>
          )
        })}
      </nav>
      <div className="max-w-3xl">
        <Outlet />
      </div>
    </main>
  )
}
