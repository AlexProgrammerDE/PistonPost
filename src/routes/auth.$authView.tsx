import { createFileRoute, notFound } from "@tanstack/react-router"

import { Auth } from "@/components/auth/auth"
import { getAuthViewLabel, validAuthPathSegments } from "@/lib/auth-ui-metadata"

export const Route = createFileRoute("/auth/$authView")({
  beforeLoad: ({ params }) => {
    if (!validAuthPathSegments.has(params.authView)) throw notFound()
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
  return (
    <>
      {/* Better Auth UI renders its card title as a div, so the page needs its own heading. */}
      <h1 className="sr-only">{getAuthViewLabel(authView)}</h1>
      <Auth path={authView} socialLayout="horizontal" className="w-full max-w-sm" />
    </>
  )
}
