import type { QueryClient } from "@tanstack/react-query"
import { HeadContent, Link, Scripts, createRootRouteWithContext } from "@tanstack/react-router"
import { ArrowLeft, FileQuestion } from "lucide-react"

import { AppProviders } from "@/components/app-providers"
import { AppShell } from "@/components/app-shell"
import { ButtonLink } from "@/components/ButtonLink"
import { RouteAnnouncer } from "@/components/RouteAnnouncer"
import { RouteError } from "@/components/RouteError"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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

const notFoundSeo = createSeoHead({
  title: "Page not found · PistonPost",
  description: "The address may be wrong, or the page may have moved.",
  path: "/",
  twitterCard: "summary",
  indexing: "noindex",
})

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getPublicRuntimeConfig(),
  staleTime: Infinity,
  // The root is the only not-found boundary, so its head is the only asset match that
  // TanStack Router keeps when a path is unknown or a loader throws notFound().
  head: ({ match }) => ({
    meta: [
      {
        charSet: "utf8",
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
      // oxlint-disable-next-line no-underscore-dangle -- RouteMatch exposes the not-found boundary only as `_notFound`.
      ...(match._notFound ? notFoundSeo.meta : defaultSeo.meta),
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // The size hint marks the ICO as the fallback, so browsers with SVG support skip downloading it.
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.json" },
      {
        rel: "alternate",
        href: "/feed.xml",
        type: "application/atom+xml",
        title: "PistonPost latest posts",
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <Empty className="w-full max-w-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            <h1>Page not found</h1>
          </EmptyTitle>
          <EmptyDescription>The address may be wrong, or the page may have moved.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ButtonLink render={<Link to="/" />}>
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Back to latest posts
          </ButtonLink>
        </EmptyContent>
      </Empty>
    </main>
  ),
  errorComponent: RouteError,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  const { turnstileSiteKey, accountActivity, vapidPublicKey } = Route.useLoaderData()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#fff9ed" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#170c0b" media="(prefers-color-scheme: dark)" />
        <HeadContent />
      </head>
      <body>
        <AppProviders
          queryClient={queryClient}
          turnstileSiteKey={turnstileSiteKey}
          accountActivity={accountActivity}
          vapidPublicKey={vapidPublicKey}
        >
          <AppShell>{children}</AppShell>
          <RouteAnnouncer />
        </AppProviders>
        <Scripts />
      </body>
    </html>
  )
}
