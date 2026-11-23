import { createFileRoute } from "@tanstack/react-router"

import { AdminPage } from "@/components/AdminPage"
import { Admin } from "@/components/auth/admin/admin"

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · PistonPost" }] }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  return (
    // The upstream users screen renders its own heading in the AdminPageHeader position.
    <AdminPage current="users">
      <Admin hideNav view="users" />
    </AdminPage>
  )
}
