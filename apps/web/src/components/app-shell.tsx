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

const publicLinks = [{ to: "/" as const, label: "Latest" }]
const legalLinks = [
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
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link
            to="/"
            className="shrink-0 font-heading text-xl font-extrabold tracking-[-0.045em]"
            aria-label="PistonPost home"
          >
            piston<span className="text-primary">post</span>
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
                <Skeleton
                  role="status"
                  className="size-9 rounded-full"
                  aria-label="Loading account menu"
                />
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
                  <SheetTitle>pistonpost</SheetTitle>
                  <SheetDescription>Posts, pictures, and videos.</SheetDescription>
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
                  {legalLinks.map((item) => (
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
