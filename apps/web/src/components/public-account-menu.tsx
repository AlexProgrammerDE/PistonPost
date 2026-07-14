"use client"

import { authClient } from "@pistonpost/auth/client"
import { Avatar, AvatarFallback, AvatarImage } from "@pistonpost/ui/components/avatar"
import { buttonVariants } from "@pistonpost/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pistonpost/ui/components/dropdown-menu"
import { Skeleton } from "@pistonpost/ui/components/skeleton"
import { cn } from "@pistonpost/ui/lib/utils"
import { Link } from "@tanstack/react-router"

import { LogIn, LogOut, Settings, User2 } from "@/components/icons"

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
    return <Skeleton className="size-9 rounded-full" aria-label="Loading account menu" />
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
          <User2 />
          My posts
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/account/comments" />}>
          <User2 />
          My comments
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/account/media" />}>
          <User2 />
          My media
        </DropdownMenuItem>
        {user.role === "admin" ? (
          <DropdownMenuItem
            render={
              <Link
                to="/admin/$section"
                params={{ section: "posts" }}
                search={{
                  q: "",
                  sort: "createdAt",
                  direction: "desc",
                  cursor: "",
                  trail: "",
                  hidden: "",
                }}
              />
            }
          >
            <Settings />
            Administration
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          render={
            <Link to="/account/settings/$settingsView" params={{ settingsView: "account" }} />
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
