"use client"

import { useSession } from "@better-auth-ui/react"
import { Link } from "@tanstack/react-router"
import { FileText, Settings, Shield, User2 } from "lucide-react"
import type { ReactElement } from "react"

import { authClient } from "@/auth/client"
import { UserButton } from "@/components/auth/user/user-button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

export function SidebarAccountMenu() {
  const session = useSession(authClient)
  const { isMobile, setOpenMobile, state } = useSidebar()
  const user = session.data?.user
  const collapsed = state === "collapsed" && !isMobile
  const links: ReactElement[] = []

  if (session.isPending) {
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

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false)
  }

  if (user?.username) {
    links.push(
      <DropdownMenuItem
        key="public-profile"
        render={
          <Link
            to="/user/$username"
            params={{ username: user.username }}
            viewTransition={isMobile ? false : undefined}
          />
        }
        onClick={closeMobileSidebar}
      >
        <User2 aria-hidden="true" />
        Public profile
      </DropdownMenuItem>,
    )
  }

  if (user) {
    links.push(
      <DropdownMenuItem
        key="my-posts"
        render={<Link to="/account/posts" viewTransition={isMobile ? false : undefined} />}
        onClick={closeMobileSidebar}
      >
        <FileText aria-hidden="true" />
        My posts
      </DropdownMenuItem>,
    )

    if (user.role === "admin") {
      links.push(
        <DropdownMenuItem
          key="administration"
          render={<Link to="/admin" viewTransition={isMobile ? false : undefined} />}
          onClick={closeMobileSidebar}
        >
          <Shield aria-hidden="true" />
          Administration
        </DropdownMenuItem>,
      )
    }

    links.push(
      <DropdownMenuItem
        key="settings"
        render={
          <Link
            to="/account/settings/$settingsView"
            params={{ settingsView: "profile" }}
            viewTransition={isMobile ? false : undefined}
          />
        }
        onClick={closeMobileSidebar}
      >
        <Settings aria-hidden="true" />
        Settings
      </DropdownMenuItem>,
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <UserButton
          align="end"
          className={collapsed ? "mx-auto size-8" : "w-full justify-start"}
          hideSettings
          links={links}
          sideOffset={4}
          size={collapsed ? "icon" : "default"}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
