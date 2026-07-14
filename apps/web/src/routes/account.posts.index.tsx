import { Badge } from "@pistonpost/ui/components/badge"
import { Button } from "@pistonpost/ui/components/button"
import { Link, createFileRoute } from "@tanstack/react-router"

import { DataTable, createAppColumnHelper } from "@/lib/table/app-table"
import { getMyPosts } from "@/server/tables"

type MyPost = Awaited<ReturnType<typeof getMyPosts>>[number]
const column = createAppColumnHelper<MyPost>()
const columns = column.columns([
  column.accessor("title", { header: "Post" }),
  column.accessor("type", { header: "Format" }),
  column.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
  }),
  column.accessor("visibility", { header: "Visibility" }),
  column.accessor("comments", { header: "Comments" }),
  column.accessor("reactions", { header: "Reactions" }),
  column.display({
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button
        nativeButton={false}
        variant="ghost"
        size="sm"
        render={<Link to="/post/$postId/edit" params={{ postId: row.original.id }} />}
      >
        Edit
      </Button>
    ),
  }),
])

export const Route = createFileRoute("/account/posts/")({
  loader: () => getMyPosts(),
  head: () => ({
    meta: [{ title: "My posts · PistonPost" }, { name: "robots", content: "noindex" }],
  }),
  component: MyPosts,
})

function MyPosts() {
  const posts = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-9 flex flex-col gap-4 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-heading text-3xl font-bold tracking-tight">My posts</h1>
        <Button nativeButton={false} render={<Link to="/account/posts/new" />}>
          New post
        </Button>
      </header>
      <DataTable
        data={posts}
        columns={columns}
        getRowId={(post) => post.id}
        emptyMessage="You have not posted anything yet."
      />
    </main>
  )
}
