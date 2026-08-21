import { Link, createFileRoute } from "@tanstack/react-router"

import { AdminSectionNav } from "@/components/AdminSectionNav"
import { Admin } from "@/components/auth/admin/admin"

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · PistonPost" }] }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
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
