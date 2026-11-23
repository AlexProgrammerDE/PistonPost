import { Link, createFileRoute } from "@tanstack/react-router"

import { AdminSectionNav } from "@/components/AdminSectionNav"
import { Admin } from "@/components/auth/admin/admin"
import { widePageClassName } from "@/lib/page-layout"

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · PistonPost" }] }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  return (
    <main className={widePageClassName}>
      <Link
        to="/admin"
        className="mb-6 inline-flex text-sm text-muted-foreground hover:text-foreground"
      >
        Administration
      </Link>
      <AdminSectionNav className="mb-6" current="users" />
      <Admin hideNav view="users" />
    </main>
  )
}
