import { Button, buttonVariants } from "@pistonpost/ui/components/button"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@pistonpost/ui/components/navigation-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@pistonpost/ui/components/sheet"
import { Skeleton } from "@pistonpost/ui/components/skeleton"
import { cn } from "@pistonpost/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { lazy, Suspense, useState, useSyncExternalStore, type PropsWithChildren } from "react"

import { Add, Menu } from "@/components/icons"

const PublicAccountMenu = lazy(() =>
  import("@/components/public-account-menu").then((module) => ({
    default: module.PublicAccountMenu,
  })),
)

const publicLinks = [
  { to: "/" as const, label: "Latest" },
  { to: "/privacy" as const, label: "Privacy" },
  { to: "/terms" as const, label: "Terms" },
]

export function AppShell({ children }: PropsWithChildren) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
  return (
    <div className="flex min-h-svh flex-col" data-hydrated={hydrated}>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-16 w-full max-w-[94rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2"
            aria-label="PistonPost home"
          >
            <span className="grid size-8 place-items-center rounded-md border bg-foreground font-heading text-sm font-bold text-background transition-transform group-hover:-rotate-2">
              PP
            </span>
            <span className="hidden font-heading text-lg font-semibold tracking-tight sm:inline">
              PistonPost
            </span>
          </Link>

          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              {publicLinks.map((item) => (
                <NavigationMenuItem key={item.to}>
                  <NavigationMenuLink render={<Link to={item.to} />}>
                    {item.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/account/posts/new"
              className={cn(buttonVariants({ variant: "default" }), "hidden sm:inline-flex")}
            >
              <Add />
              New post
            </Link>
            <Suspense
              fallback={
                <Skeleton className="size-9 rounded-full" aria-label="Loading account menu" />
              }
            >
              <PublicAccountMenu />
            </Suspense>
            <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="md:hidden"
                    aria-label="Open navigation"
                    disabled={!hydrated}
                  />
                }
              >
                <Menu />
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>PistonPost</SheetTitle>
                  <SheetDescription>Independent text, photography, and video.</SheetDescription>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4" aria-label="Mobile navigation">
                  {publicLinks.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="rounded-md px-3 py-3 text-base font-medium hover:bg-muted"
                      onClick={() => setNavigationOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Link
                    to="/account/posts/new"
                    className="mt-4 rounded-md bg-primary px-3 py-3 font-medium text-primary-foreground"
                    onClick={() => setNavigationOpen(false)}
                  >
                    New post
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t bg-muted/30">
        <div className="mx-auto flex w-full max-w-[94rem] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>Built for the work worth sharing.</p>
          <p className="font-mono text-xs tracking-[0.16em] uppercase">
            PistonPost / independent publishing
          </p>
        </div>
      </footer>
    </div>
  )
}
