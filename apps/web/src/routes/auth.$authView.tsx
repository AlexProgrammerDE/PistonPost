import { createFileRoute } from "@tanstack/react-router"

import { Auth } from "@/components/auth/auth"

export const Route = createFileRoute("/auth/$authView")({
  component: AuthView,
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatViewName(params.authView)} | PistonPost`,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
})

function formatViewName(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function AuthView() {
  const { authView } = Route.useParams()
  return <Auth path={authView} />
}
