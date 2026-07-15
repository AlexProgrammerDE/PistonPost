import { Outlet, createFileRoute } from "@tanstack/react-router"

import { AuthenticationProvider } from "@/components/providers"
import { getPublicRuntimeConfig } from "@/server/public-config"

export const Route = createFileRoute("/auth")({
  loader: () => getPublicRuntimeConfig(),
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AuthLayout,
})

function AuthLayout() {
  const { queryClient } = Route.useRouteContext()
  const { turnstileSiteKey } = Route.useLoaderData()

  return (
    <AuthenticationProvider queryClient={queryClient} turnstileSiteKey={turnstileSiteKey}>
      <main className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-md items-center px-5 py-12 sm:px-0">
        <section className="w-full" aria-label="Account access">
          <Outlet />
        </section>
      </main>
    </AuthenticationProvider>
  )
}
