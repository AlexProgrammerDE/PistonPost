"use client"

import { useSession } from "@better-auth-ui/react"
import { Link } from "@tanstack/react-router"
import { ChevronsUpDown, FileText, LogIn, LogOut, Settings, Shield, User2 } from "lucide-react"

import { authClient } from "@/auth/client"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

function initials(name: string) {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase())
    .join("")
}

export function SidebarAccountMenu() {
  const session = useSession(authClient)
  const { isMobile, setOpenMobile } = useSidebar()
  const user = session.data?.user

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false)
  }

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

  if (!user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Sign in"
            render={<Link to="/auth/$authView" params={{ authView: "sign-in" }} />}
            onClick={closeMobileSidebar}
          >
            <LogIn aria-hidden="true" />
            <span>Sign in</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const label = user.displayUsername ?? user.username ?? user.name

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" aria-label={`Open account menu for ${label}`} />}
          >
            <Avatar className="size-8">
              {user.image ? <ResponsiveAvatarImage src={user.image} sizes="2rem" alt="" /> : null}
              <AvatarFallback className="text-foreground">
                {initials(label) || <User2 aria-hidden="true" />}
              </AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{label}</span>
              {user.username ? (
                <span className="truncate text-xs text-sidebar-foreground/70">
                  @{user.username}
                </span>
              ) : null}
            </span>
            <ChevronsUpDown aria-hidden="true" className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="grid gap-0.5">
                <span className="truncate font-medium text-foreground">{label}</span>
                {user.username ? <span className="truncate">@{user.username}</span> : null}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {user.username ? (
                <DropdownMenuItem
                  render={<Link to="/user/$username" params={{ username: user.username }} />}
                  onClick={closeMobileSidebar}
                >
                  <User2 aria-hidden="true" />
                  Public profile
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem render={<Link to="/account/posts" />} onClick={closeMobileSidebar}>
                <FileText aria-hidden="true" />
                My posts
              </DropdownMenuItem>
              {user.role === "admin" ? (
                <DropdownMenuItem render={<Link to="/admin" />} onClick={closeMobileSidebar}>
                  <Shield aria-hidden="true" />
                  Administration
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                render={
                  <Link to="/account/settings/$settingsView" params={{ settingsView: "profile" }} />
                }
                onClick={closeMobileSidebar}
              >
                <Settings aria-hidden="true" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link to="/auth/$authView" params={{ authView: "sign-out" }} />}
                onClick={closeMobileSidebar}
              >
                <LogOut aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
