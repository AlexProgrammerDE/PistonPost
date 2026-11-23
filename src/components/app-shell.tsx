import { Link, useLocation } from "@tanstack/react-router"
import { SquarePen } from "lucide-react"
import { useSyncExternalStore, type PropsWithChildren } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { ButtonLink } from "@/components/ButtonLink"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { MAIN_CONTENT_ID } from "@/lib/route-announcement"

export function AppShell({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )

  return (
    <SidebarProvider data-hydrated={hydrated}>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="fixed top-3 left-3 z-50 bg-background px-3 py-2 text-sm font-medium shadow-sm not-focus:sr-only focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-view-transition-chrome="mobile-header"
          className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-3 md:hidden"
        >
          <SidebarTrigger aria-label="Open navigation" className="size-11" />
          <Link
            to="/"
            className="inline-flex h-11 items-center font-heading text-lg font-extrabold tracking-brand"
            aria-label="PistonPost home"
            translate="no"
          >
            piston<span className="text-primary">post</span>
          </Link>
          {pathname === "/posts/new" ? null : (
            <ButtonLink
              render={<Link to="/posts/new" viewTransition={false} />}
              className="ml-auto h-11 px-4"
            >
              <SquarePen aria-hidden="true" data-icon="inline-start" />
              Post
            </ButtonLink>
          )}
        </header>

        <div id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </div>
      </div>
    </SidebarProvider>
  )
}
