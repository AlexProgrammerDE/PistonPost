import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { adminDestinations, type AdminDestination } from "@/lib/admin-sections"
import { cn } from "@/lib/utils"

const linkClassName =
  "shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"

const tableSearch = {
  q: "",
  sort: "createdAt",
  direction: "desc",
  cursor: "",
  trail: "",
  hidden: "",
} as const

function DestinationLink({
  value,
  current,
  children,
}: {
  value: AdminDestination
  current: boolean
  children: ReactNode
}) {
  const linkProps = {
    "aria-current": current ? ("page" as const) : undefined,
    className: linkClassName,
  }
  if (value === "overview") {
    return (
      // Without an exact match the router marks the overview active on every admin page.
      <Link to="/admin" activeOptions={{ exact: true }} {...linkProps}>
        {children}
      </Link>
    )
  }
  if (value === "users") {
    return (
      <Link to="/admin/users" {...linkProps}>
        {children}
      </Link>
    )
  }
  if (value === "email-campaigns") {
    return (
      <Link to="/admin/email-campaigns" {...linkProps}>
        {children}
      </Link>
    )
  }
  return (
    <Link to="/admin/$section" params={{ section: value }} search={tableSearch} {...linkProps}>
      {children}
    </Link>
  )
}

export function AdminSectionNav({
  className,
  current,
}: {
  className?: string
  current: AdminDestination
}) {
  return (
    <nav
      className={cn("flex overflow-x-auto border-b", className)}
      aria-label="Administration sections"
    >
      {adminDestinations.map((destination) => (
        <DestinationLink
          key={destination.value}
          value={destination.value}
          current={destination.value === current}
        >
          {destination.label}
        </DestinationLink>
      ))}
    </nav>
  )
}
