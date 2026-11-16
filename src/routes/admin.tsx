import { authQueryKeys, ensureSession } from "@better-auth-ui/core"
import type { QueryClient } from "@tanstack/react-query"
import { Outlet, createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"

import { authClient } from "@/auth/client"
import { getCurrentSession } from "@/server/session"

const ensureAdminSession = createIsomorphicFn()
  .server((queryClient: QueryClient) =>
    queryClient.ensureQueryData({
      queryKey: authQueryKeys.session,
      queryFn: () => getCurrentSession(),
    }),
  )
  .client((queryClient) => ensureSession(queryClient, authClient))

export const Route = createFileRoute("/admin")({
  // Server functions still enforce administrator access. This guard only routes
  // signed-out people to sign in and hides the admin screens from everyone else.
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const session = await ensureAdminSession(queryClient)
    if (!session) {
      throw redirect({
        to: "/auth/$authView",
        params: { authView: "sign-in" },
        search: { redirectTo: location.href },
      })
    }
    if (session.user.role !== "admin" || session.user.banned === true) throw notFound()
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Outlet,
})
