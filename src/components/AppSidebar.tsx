import { Link, useLocation } from "@tanstack/react-router"
import { Newspaper, SquarePen, UsersRound } from "lucide-react"
import { lazy, Suspense, useEffect } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const SidebarAccountMenu = lazy(() =>
  import("@/components/SidebarAccountMenu").then((module) => ({
    default: module.SidebarAccountMenu,
  })),
)

const navigationItems = [
  { to: "/", label: "Timeline", icon: Newspaper, exact: true },
  { to: "/following", label: "Following", icon: UsersRound, exact: false },
  { to: "/account/posts/new", label: "Post", icon: SquarePen, exact: true },
] as const

const legalLinks = [
  { to: "/privacy", label: "Privacy" },
  { to: "/cookie-policy", label: "Cookies" },
  { to: "/terms", label: "Terms" },
] as const

function isCurrentPath(pathname: string, to: string, exact: boolean) {
  return exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
}

function AccountMenuFallback() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          role="status"
          aria-label="Loading account menu"
          className="flex h-14 items-center gap-2 px-3"
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar() {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const currentYear = new Date().getUTCFullYear()

  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, pathname, setOpenMobile])

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar
      collapsible="icon"
      role="complementary"
      aria-label="Application sidebar"
      data-view-transition-chrome="sidebar"
    >
      <SidebarHeader className="items-start px-4 py-3 group-data-[collapsible=icon]:p-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/"
                aria-label="PistonPost home"
                className="inline-flex w-fit items-center text-sidebar-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                viewTransition={isMobile ? false : undefined}
              />
            }
            onClick={closeMobileSidebar}
          >
            <span
              aria-hidden="true"
              className="hidden size-8 shrink-0 items-center justify-center font-heading text-xl font-extrabold text-sidebar-primary group-data-[collapsible=icon]:flex"
            >
              p
            </span>
            <span
              className="font-heading text-lg font-extrabold tracking-[-0.045em] group-data-[collapsible=icon]:hidden"
              translate="no"
            >
              piston<span className="text-sidebar-primary">post</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile}>
            PistonPost home
          </TooltipContent>
        </Tooltip>
      </SidebarHeader>

      <SidebarSeparator className="mx-0 data-horizontal:w-full" />

      <SidebarContent>
        <nav aria-label="Main navigation">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => {
                  const active = isCurrentPath(pathname, item.to, item.exact)
                  const Icon = item.icon

                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        tooltip={item.label}
                        variant={item.to === "/account/posts/new" ? "outline" : "default"}
                        isActive={active}
                        aria-current={active ? "page" : undefined}
                        render={<Link to={item.to} viewTransition={isMobile ? false : undefined} />}
                        onClick={closeMobileSidebar}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-0 p-0">
        <div className="p-2">
          <Suspense fallback={<AccountMenuFallback />}>
            <SidebarAccountMenu />
          </Suspense>
        </div>
        <SidebarSeparator className="mx-0 group-data-[collapsible=icon]:hidden data-horizontal:w-full" />
        <div className="flex flex-col gap-2 p-2 group-data-[collapsible=icon]:hidden">
          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-sidebar-foreground/70"
          >
            {legalLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                viewTransition={isMobile ? false : undefined}
                aria-current={pathname === item.to ? "page" : undefined}
                className="hover:text-sidebar-foreground hover:underline"
                onClick={closeMobileSidebar}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="px-2 text-xs text-sidebar-foreground/70">
            © <span suppressHydrationWarning>{currentYear}</span> PistonPost
          </p>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
