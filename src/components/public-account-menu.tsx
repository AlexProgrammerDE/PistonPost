"use client"

import { useSession } from "@better-auth-ui/react"
import { Link } from "@tanstack/react-router"
import { FileText, LogIn, LogOut, Settings, Shield, User2 } from "lucide-react"

import { authClient } from "@/auth/client"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
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
        <LogIn />
        Sign in
      </Link>
    )
  }

  const label = user.displayUsername ?? user.username ?? user.name

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar>
          {user.image ? <ResponsiveAvatarImage src={user.image} sizes="2rem" alt="" /> : null}
          <AvatarFallback className="text-foreground">
            {initials(label) || <User2 />}
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
        {user.username ? (
          <DropdownMenuItem
            render={<Link to="/user/$username" params={{ username: user.username }} />}
          >
            <User2 />
            Public profile
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link to="/account/posts" />}>
          <FileText />
          My posts
        </DropdownMenuItem>
        {user.role === "admin" ? (
          <DropdownMenuItem render={<Link to="/admin" />}>
            <Shield />
            Administration
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          render={
            <Link to="/account/settings/$settingsView" params={{ settingsView: "profile" }} />
          }
        >
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/auth/$authView" params={{ authView: "sign-out" }} />}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
