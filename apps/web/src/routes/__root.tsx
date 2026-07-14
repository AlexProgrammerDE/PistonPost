import type { QueryClient } from "@tanstack/react-query"
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router"

import { AppProviders } from "@/components/app-providers"
import { AppShell } from "@/components/app-shell"

import appCss from "@pistonpost/ui/globals.css?url"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "PistonPost",
      },
      {
        name: "description",
        content: "Posts, pictures, videos, and whatever else is worth passing around.",
      },
      { name: "theme-color", content: "#fff9ed" },
      { property: "og:site_name", content: "PistonPost" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-default.svg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <div className="typeset text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1>This post isn’t here.</h1>
        <p>It may have been deleted, hidden, or the address may be wrong.</p>
      </div>
    </main>
  ),
  errorComponent: ({ error }) => (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <div className="typeset text-center">
        <p className="text-sm font-medium text-destructive">Something went wrong</p>
        <h1>We couldn’t load this page.</h1>
        <p>{error.message}</p>
      </div>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProviders queryClient={queryClient}>
          <AppShell>{children}</AppShell>
        </AppProviders>
        <Scripts />
      </body>
    </html>
  )
}
