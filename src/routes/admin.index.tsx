import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronRight, Mail } from "lucide-react"

import { AdminOverviewSkeleton } from "@/components/LoadingStates"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { adminSections } from "@/lib/admin-sections"
import { getAdminOverview } from "@/server/tables"

export const Route = createFileRoute("/admin/")({
  loader: () => getAdminOverview(),
  head: () => ({ meta: [{ title: "Administration · PistonPost" }] }),
  component: AdminOverview,
  pendingComponent: AdminOverviewSkeleton,
})

function AdminOverview() {
  const counts = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 border-b pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Administration</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Moderate content, manage access, and inspect operational problems.
        </p>
      </header>
      <ItemGroup role="presentation" className="mb-6 gap-0 border-y">
        <Item
          render={<Link to="/admin/email-campaigns" />}
          className="rounded-none px-1 py-5 sm:px-3"
        >
          <ItemMedia variant="icon">
            <Mail aria-hidden="true" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Email campaigns</ItemTitle>
            <ItemDescription>Draft, preview, and queue optional product updates.</ItemDescription>
          </ItemContent>
          <ItemActions className="text-muted-foreground">
            <ChevronRight aria-hidden="true" />
          </ItemActions>
        </Item>
      </ItemGroup>
      <nav aria-label="Administration sections">
        <ItemGroup role="presentation" className="gap-0 border-y">
          {adminSections.map((section) => (
            <Item
              key={section.value}
              render={
                <Link
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
                />
              }
              className="rounded-none border-x-0 border-t-0 px-1 py-5 last:border-b-0 sm:px-3"
              variant="outline"
            >
              <ItemContent className="min-w-0">
                <ItemTitle>{section.label}</ItemTitle>
                <ItemDescription>{section.description}</ItemDescription>
              </ItemContent>
              <ItemActions className="text-sm text-muted-foreground tabular-nums">
                {counts[section.value]}
                <ChevronRight aria-hidden="true" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </nav>
    </main>
  )
}
