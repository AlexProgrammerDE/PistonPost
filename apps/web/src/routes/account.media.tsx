import { Badge } from "@pistonpost/ui/components/badge"
import { createFileRoute } from "@tanstack/react-router"

import { DataTable, createAppColumnHelper } from "@/lib/table/app-table"
import { getMyMedia } from "@/server/tables"

type MediaRow = Awaited<ReturnType<typeof getMyMedia>>[number]
const column = createAppColumnHelper<MediaRow>()
const columns = column.columns([
  column.accessor("filename", { header: "File" }),
  column.accessor("kind", { header: "Kind" }),
  column.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
  }),
  column.accessor("byteSize", {
    header: "Size",
    cell: ({ getValue }) => `${(getValue() / 1024 / 1024).toFixed(1)} MB`,
  }),
  column.accessor("createdAt", {
    header: "Created",
    cell: ({ getValue }) => getValue().toLocaleDateString("en"),
  }),
])

export const Route = createFileRoute("/account/media")({
  loader: () => getMyMedia(),
  head: () => ({
    meta: [{ title: "My media · PistonPost" }, { name: "robots", content: "noindex" }],
  }),
  component: MyMedia,
})

function MyMedia() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="typeset mb-9 border-b pb-7">
        <p className="font-mono text-xs tracking-[0.18em] text-primary uppercase">Asset bay</p>
        <h1>My media</h1>
      </header>
      <DataTable data={Route.useLoaderData()} columns={columns} getRowId={(row) => row.id} />
    </main>
  )
}
