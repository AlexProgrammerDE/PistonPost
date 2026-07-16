import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { lazy, Suspense, useSyncExternalStore, type PropsWithChildren } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

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
            translate="no"
          >
            piston<span className="text-primary">post</span>
          </Link>

          <nav className="ml-5" aria-label="Main navigation">
            <Link
              to="/following"
              className="text-sm font-medium text-muted-foreground underline-offset-8 hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:underline"
              activeProps={{ "aria-current": "page" }}
            >
              Following
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/account/posts/new"
              className={cn(
                buttonVariants({ variant: "default" }),
                "size-9 px-0 sm:size-auto sm:px-3",
              )}
            >
              <Plus data-icon="inline-start" />
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
          <Link
            to="/"
            className="shrink-0 font-heading text-xl font-extrabold tracking-[-0.045em] text-foreground"
            aria-label="PistonPost home"
            translate="no"
          >
            piston<span className="text-primary">post</span>
          </Link>
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
