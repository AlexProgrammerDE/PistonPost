import { Link } from "@tanstack/react-router"
import { useSyncExternalStore, type PropsWithChildren } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export function AppShell({ children }: PropsWithChildren) {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )

  return (
    <SidebarProvider data-hydrated={hydrated}>
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 z-50 bg-background px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-3 md:hidden">
          <SidebarTrigger aria-label="Open navigation" />
          <Link
            to="/"
            className="font-heading text-lg font-extrabold tracking-[-0.045em]"
            aria-label="PistonPost home"
            translate="no"
          >
            piston<span className="text-primary">post</span>
          </Link>
        </header>

        <div id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </div>
      </div>
    </SidebarProvider>
  )
}
