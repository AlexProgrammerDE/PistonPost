import { Badge } from "@pistonpost/ui/components/badge"
import { Button } from "@pistonpost/ui/components/button"
import { Link, createFileRoute } from "@tanstack/react-router"

import { DataTable, createAppColumnHelper } from "@/lib/table/app-table"
import { getMyComments } from "@/server/tables"

type CommentRow = Awaited<ReturnType<typeof getMyComments>>[number]
const column = createAppColumnHelper<CommentRow>()
const columns = column.columns([
  column.accessor("content", { header: "Comment" }),
  column.accessor("postTitle", { header: "Post" }),
  column.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
  }),
  column.accessor("createdAt", {
    header: "Created",
    cell: ({ getValue }) => getValue().toLocaleDateString("en"),
  }),
  column.display({
    id: "post",
    header: "",
    cell: ({ row }) => (
      <Button
        nativeButton={false}
        variant="ghost"
        size="sm"
        render={<Link to="/post/$postId" params={{ postId: row.original.postId }} />}
      >
        View post
      </Button>
    ),
  }),
])

export const Route = createFileRoute("/account/comments")({
  loader: () => getMyComments(),
  head: () => ({
    meta: [{ title: "My comments · PistonPost" }, { name: "robots", content: "noindex" }],
  }),
  component: MyComments,
})

function MyComments() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-9 border-b pb-7">
        <h1 className="font-heading text-3xl font-bold tracking-tight">My comments</h1>
      </header>
      <DataTable data={Route.useLoaderData()} columns={columns} getRowId={(row) => row.id} />
    </main>
  )
}
