"use client"

import { useSession } from "@better-auth-ui/react"
import { Link } from "@tanstack/react-router"
import { FileText, LogIn, LogOut, Settings, Shield, User2 } from "lucide-react"

import { authClient } from "@/auth/client"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase())
    .join("")
}

export function PublicAccountMenu() {
  const session = useSession(authClient)
  const user = session.data?.user

  if (session.isPending) {
    return (
      <Skeleton role="status" className="size-9 rounded-full" aria-label="Loading account menu" />
    )
  }

  if (!user) {
    return (
      <Link
        to="/auth/$authView"
        params={{ authView: "sign-in" }}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <LogIn aria-hidden="true" data-icon="inline-start" />
        Sign in
      </Link>
    )
  }

  const label = user.displayUsername ?? user.username ?? user.name

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        render={<Button variant="ghost" size="icon" className="rounded-full" />}
      >
        <Avatar>
          {user.image ? <ResponsiveAvatarImage src={user.image} sizes="2rem" alt="" /> : null}
          <AvatarFallback className="text-foreground">
            {initials(label) || <User2 aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
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
            >
              <User2 aria-hidden="true" />
              Public profile
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem render={<Link to="/account/posts" />}>
            <FileText aria-hidden="true" />
            My posts
          </DropdownMenuItem>
          {user.role === "admin" ? (
            <DropdownMenuItem render={<Link to="/admin" />}>
              <Shield aria-hidden="true" />
              Administration
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            render={
              <Link to="/account/settings/$settingsView" params={{ settingsView: "profile" }} />
            }
          >
            <Settings aria-hidden="true" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link to="/auth/$authView" params={{ authView: "sign-out" }} />}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
