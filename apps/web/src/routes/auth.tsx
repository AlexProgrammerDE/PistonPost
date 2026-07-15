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
      <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(20rem,0.8fr)_minmax(32rem,1.2fr)]">
        <section className="hidden border-r bg-secondary/55 p-10 lg:flex lg:flex-col lg:justify-between">
          <a href="/" className="font-heading text-xl font-extrabold tracking-[-0.045em]">
            piston<span className="text-primary">post</span>
          </a>
          <div className="max-w-sm">
            <h1 className="font-heading text-4xl leading-[1.08] font-bold tracking-tight">
              Good posts are better with familiar faces around.
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Share pictures, videos, jokes, and whatever else you have been passing around.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">A small place on the internet.</p>
        </section>
        <section className="flex min-h-svh items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-md">
            <a
              href="/"
              className="mb-10 inline-block font-heading text-xl font-extrabold tracking-[-0.045em] lg:hidden"
            >
              piston<span className="text-primary">post</span>
            </a>
            <Outlet />
          </div>
        </section>
      </main>
    </AuthenticationProvider>
  )
}
