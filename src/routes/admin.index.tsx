import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { AdminPage, AdminPageHeader, AdminRouteError } from "@/components/AdminPage"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import {
  adminEmailCampaignsDestination,
  adminOverviewDestination,
  adminSections,
} from "@/lib/admin-sections"
import { getAdminOverview } from "@/server/tables"

export const Route = createFileRoute("/admin/")({
  loader: () => getAdminOverview(),
  head: () => ({ meta: [{ title: "Administration · PistonPost" }] }),
  component: AdminOverview,
  pendingComponent: () => <AdminOverviewContent />,
  errorComponent: () => (
    <AdminRouteError
      current="overview"
      title="Administration"
      description={adminOverviewDestination.description}
    />
  ),
})

const itemClassName = "rounded-none border-x-0 border-t-0 px-1 py-5 last:border-b-0 sm:px-3"

function OverviewItem({
  render,
  title,
  description,
  count,
}: {
  render: ReactElement
  title: string
  description: string
  count?: ReactNode
}) {
  return (
    <Item render={render} className={itemClassName} variant="outline">
      <ItemContent className="min-w-0">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        {count}
        <ChevronRight aria-hidden="true" />
      </ItemActions>
    </Item>
  )
}

type AdminOverviewCounts = Awaited<ReturnType<typeof getAdminOverview>>

function AdminOverview() {
  return <AdminOverviewContent counts={Route.useLoaderData()} />
}

/** Section links stay usable while the counts load. */
function AdminOverviewContent({ counts }: { counts?: AdminOverviewCounts }) {
  return (
    <AdminPage current="overview">
      <AdminPageHeader title="Administration" description={adminOverviewDestination.description} />
      <ItemGroup role="presentation" className="gap-0 border-y">
        {adminSections.map((section) => (
          <OverviewItem
            key={section.value}
            render={
              section.value === "users" ? (
                <Link to="/admin/users" />
              ) : (
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
              )
            }
            title={section.label}
            description={section.description}
            count={
              counts ? (
                `${counts[section.value].toLocaleString("en-US")} ${section.countLabel}`
              ) : (
                <Skeleton className="h-4 w-16" />
              )
            }
          />
        ))}
        <OverviewItem
          render={<Link to="/admin/email-campaigns" />}
          title={adminEmailCampaignsDestination.label}
          description={adminEmailCampaignsDestination.description}
        />
      </ItemGroup>
    </AdminPage>
  )
}
