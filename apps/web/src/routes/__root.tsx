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
        content: "Independent publishing for text, photography, and video.",
      },
      { name: "theme-color", content: "#f5f2ed" },
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
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <div className="typeset text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          Error 404
        </p>
        <h1>That transmission is not here.</h1>
        <p>It may have been deleted, moderated, or entered incorrectly.</p>
      </div>
    </main>
  ),
  errorComponent: ({ error }) => (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <div className="typeset text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-destructive uppercase">
          Unexpected failure
        </p>
        <h1>The press stopped.</h1>
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
