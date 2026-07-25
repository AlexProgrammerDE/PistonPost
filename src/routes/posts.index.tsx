import { createFileRoute, redirect } from "@tanstack/react-router"

import { getCurrentSession } from "@/server/session"

export const Route = createFileRoute("/posts/")({
  beforeLoad: async ({ location }) => {
    const session = await getCurrentSession()
    if (!session) {
      throw redirect({
        to: "/auth/$authView",
        params: { authView: "sign-in" },
        search: { redirectTo: location.href },
      })
    }

    if (!session.user.username) {
      throw redirect({
        to: "/settings/$settingsView",
        params: { settingsView: "profile" },
        replace: true,
      })
    }

    throw redirect({
      to: "/user/$username",
      params: { username: session.user.username },
      replace: true,
    })
  },
})
