import { buttonVariants } from "@pistonpost/ui/components/button"
import { Skeleton } from "@pistonpost/ui/components/skeleton"
import { cn } from "@pistonpost/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { lazy, Suspense, useSyncExternalStore, type PropsWithChildren } from "react"

import { Add } from "@/components/icons"

const PublicAccountMenu = lazy(() =>
  import("@/components/public-account-menu").then((module) => ({
    default: module.PublicAccountMenu,
  })),
)

const legalLinks = [
  { to: "/privacy" as const, label: "Privacy" },
  { to: "/terms" as const, label: "Terms" },
]

export function AppShell({ children }: PropsWithChildren) {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )

  return (
    <div className="flex min-h-svh flex-col" data-hydrated={hydrated}>
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 z-50 bg-background px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 sm:px-6">
          <Link
            to="/"
            className="shrink-0 font-heading text-xl font-extrabold tracking-[-0.045em]"
            aria-label="PistonPost home"
          >
            piston<span className="text-primary">post</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/account/posts/new"
              className={cn(
                buttonVariants({ variant: "default" }),
                "size-9 px-0 sm:size-auto sm:px-3",
              )}
            >
              <Add data-icon="inline-start" />
              <span className="sr-only sm:not-sr-only">New post</span>
            </Link>
            <Suspense
              fallback={
                <Skeleton
                  role="status"
                  className="size-9 rounded-full"
                  aria-label="Loading account menu"
                />
              }
            >
              <PublicAccountMenu />
            </Suspense>
          </div>
        </div>
      </header>

      <div id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </div>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <p className="font-heading font-semibold text-foreground">pistonpost</p>
          <nav className="flex items-center gap-4" aria-label="Legal">
            {legalLinks.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
