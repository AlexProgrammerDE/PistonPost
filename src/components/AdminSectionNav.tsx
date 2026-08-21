import { Link } from "@tanstack/react-router"

import { adminSections, type AdminSection } from "@/lib/admin-sections"
import { cn } from "@/lib/utils"

export function AdminSectionNav({
  className,
  current,
}: {
  className?: string
  current: AdminSection | "users"
}) {
  return (
    <nav
      className={cn("flex overflow-x-auto border-b", className)}
      aria-label="Administration sections"
    >
      {adminSections.map((section) => {
        const linkClassName =
          "shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
        const ariaCurrent: "page" | undefined = section.value === current ? "page" : undefined
        const linkProps = {
          "aria-current": ariaCurrent,
          className: linkClassName,
        }

        return section.value === "users" ? (
          <Link key={section.value} to="/admin/users" {...linkProps}>
            {section.label}
          </Link>
        ) : (
          <Link
            key={section.value}
            to="/admin/$section"
            params={{ section: section.value }}
            search={{
              q: "",
              sort: "createdAt",
              direction: "desc",
              cursor: "",
              trail: "",
              hidden: "",
            }}
            {...linkProps}
          >
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
