import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { AuthPageSkeleton } from "@/components/LoadingStates"
import { authSearchSchema } from "@/lib/local-redirect"

export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  beforeLoad: ({ location, search }) => {
    const requestedRedirect = new URLSearchParams(location.searchStr).get("redirectTo")
    if (requestedRedirect !== null && search.redirectTo === undefined) {
      throw redirect({
        href: `${location.pathname}${location.hash ? `#${location.hash}` : ""}`,
        replace: true,
      })
    }
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AuthLayout,
  pendingComponent: AuthPageSkeleton,
})

function AuthLayout() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-md items-center px-5 py-12 sm:px-0">
      <section className="w-full" aria-label="Account access">
        <Outlet />
      </section>
    </main>
  )
}
