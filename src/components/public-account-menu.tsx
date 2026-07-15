"use client"

import { Link } from "@tanstack/react-router"

import { authClient } from "@/auth/client"
import { FileText, LogIn, LogOut, Settings, Shield, User2 } from "@/components/icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  const session = authClient.useSession()
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
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
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
        <DropdownMenuItem onClick={() => void authClient.signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
