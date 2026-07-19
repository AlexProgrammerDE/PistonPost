import { useQueryErrorResetBoundary, type QueryClient } from "@tanstack/react-query"
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router"
import { ArrowLeft, House, RotateCcw } from "lucide-react"
import { useEffect } from "react"

import { AppProviders } from "@/components/app-providers"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { SITE_DESCRIPTION, createSeoHead } from "@/lib/seo"
import { getPublicRuntimeConfig } from "@/server/public-config"

import appCss from "@/styles/globals.css?url"

const defaultSeo = createSeoHead({
  title: "PistonPost",
  description: SITE_DESCRIPTION,
  path: "/",
  twitterCard: "summary",
  indexing: "inherit",
})

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getPublicRuntimeConfig(),
  staleTime: Infinity,
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { name: "format-detection", content: "telephone=no" },
      { name: "application-name", content: "PistonPost" },
      { name: "apple-mobile-web-app-title", content: "PistonPost" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "msapplication-TileColor", content: "#dc3850" },
      { name: "msapplication-tap-highlight", content: "no" },
      {
        name: "theme-color",
        content: "#fff9ed",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#241b1b",
        media: "(prefers-color-scheme: dark)",
      },
      ...defaultSeo.meta,
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <div className="typeset typeset-post text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1>Page not found</h1>
        <p>The address may be wrong, or the page may have moved.</p>
        <Button data-not-typeset className="mt-4" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Back to latest posts
        </Button>
      </div>
    </main>
  ),
  errorComponent: RootError,
  shellComponent: RootDocument,
})

function RootError() {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  function retry() {
    queryErrorResetBoundary.reset()
    void router.invalidate()
  }

  return (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <div className="typeset typeset-post text-center">
        <p className="text-sm font-medium text-destructive">Something went wrong</p>
        <h1>We couldn’t load this page.</h1>
        <p>Try again. If the problem continues, return to the latest posts.</p>
        <div className="not-typeset mt-4 flex justify-center gap-2">
          <Button onClick={retry}>
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
            <House aria-hidden="true" data-icon="inline-start" />
            Go home
          </Button>
        </div>
      </div>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  const { turnstileSiteKey } = Route.useLoaderData()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProviders queryClient={queryClient} turnstileSiteKey={turnstileSiteKey}>
          <AppShell>{children}</AppShell>
        </AppProviders>
        <Scripts />
      </body>
    </html>
  )
}
