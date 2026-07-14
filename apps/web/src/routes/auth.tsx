import { Outlet, createFileRoute } from "@tanstack/react-router"

import { AuthenticationProvider } from "@/components/providers"
import { getPublicRuntimeConfig } from "@/server/public-config"

export const Route = createFileRoute("/auth")({
  loader: () => getPublicRuntimeConfig(),
  component: AuthLayout,
})

function AuthLayout() {
  const { queryClient } = Route.useRouteContext()
  const { turnstileSiteKey } = Route.useLoaderData()

  return (
    <AuthenticationProvider queryClient={queryClient} turnstileSiteKey={turnstileSiteKey}>
      <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(18rem,0.72fr)_minmax(32rem,1.28fr)]">
        <section className="relative hidden overflow-hidden border-r bg-muted/45 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-y-0 right-12 w-px bg-border" />
          <div className="absolute top-24 right-8 h-px w-24 bg-border" />
          <a href="/" className="relative font-heading text-xl font-semibold tracking-tight">
            PistonPost
          </a>
          <div className="relative max-w-sm">
            <p className="mb-4 font-mono text-xs font-medium tracking-[0.18em] text-primary uppercase">
              Independent transmission
            </p>
            <h1 className="font-heading text-4xl leading-[1.08] font-semibold tracking-tight">
              Your work, your archive, your address.
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Publish words, photographs, and film without turning your profile into a sales funnel.
            </p>
          </div>
          <p className="relative font-mono text-xs text-muted-foreground">
            EST. 2026 / EDGE NETWORK 01
          </p>
        </section>
        <section className="flex min-h-svh items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-md">
            <a href="/" className="mb-10 inline-block font-heading text-xl font-semibold lg:hidden">
              PistonPost
            </a>
            <Outlet />
          </div>
        </section>
      </main>
    </AuthenticationProvider>
  )
}
