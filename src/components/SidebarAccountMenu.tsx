"use client"

import { useSession } from "@better-auth-ui/react"
import { Link } from "@tanstack/react-router"
import { FileText, Settings, Shield, User2 } from "lucide-react"
import type { ReactElement } from "react"

import { authClient } from "@/auth/client"
import { UserButton } from "@/components/auth/user/user-button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"

export function SidebarAccountMenu() {
  const session = useSession(authClient)
  const { isMobile, setOpenMobile, state } = useSidebar()
  const user = session.data?.user
  const collapsed = state === "collapsed" && !isMobile
  const links: ReactElement[] = []

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
