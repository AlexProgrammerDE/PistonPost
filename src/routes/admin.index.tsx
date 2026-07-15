import { Link, createFileRoute } from "@tanstack/react-router"

import { adminSections } from "@/lib/admin-sections"
import { getAdminOverview } from "@/server/tables"

export const Route = createFileRoute("/admin/")({
  loader: () => getAdminOverview(),
  head: () => ({ meta: [{ title: "Administration · PistonPost" }] }),
  component: AdminOverview,
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
      <nav className="border-y" aria-label="Administration sections">
        {adminSections.map((section) => (
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
            className="grid gap-2 border-b px-1 py-5 last:border-b-0 hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
          >
            <span className="min-w-0">
              <span className="block font-semibold">{section.label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {section.description}
              </span>
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {counts[section.value]}
            </span>
          </Link>
        ))}
      </nav>
    </main>
  )
}
