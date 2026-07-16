import { createFileRoute, notFound } from "@tanstack/react-router"

import { Auth } from "@/components/auth/auth"
import { getAuthViewLabel, isAuthViewPath } from "@/lib/auth-ui-metadata"

export const Route = createFileRoute("/auth/$authView")({
  beforeLoad: ({ params }) => {
    if (!isAuthViewPath(params.authView)) throw notFound()
  },
  component: AuthView,
  head: ({ params }) => ({
    meta: [
      {
        title: `${getAuthViewLabel(params.authView)} | PistonPost`,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
})

function AuthView() {
  const { authView } = Route.useParams()
  return <Auth path={authView} socialLayout="horizontal" className="w-full max-w-sm" />
}
