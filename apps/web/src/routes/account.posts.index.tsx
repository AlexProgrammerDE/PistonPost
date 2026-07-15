import { Badge } from "@pistonpost/ui/components/badge"
import { Button } from "@pistonpost/ui/components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@pistonpost/ui/components/empty"
import { Link, createFileRoute } from "@tanstack/react-router"

import { getMyPosts } from "@/server/tables"

export const Route = createFileRoute("/account/posts/")({
  loader: () => getMyPosts(),
  head: () => ({
    meta: [{ title: "My posts · PistonPost" }, { name: "robots", content: "noindex" }],
  }),
  component: MyPosts,
})

const statusLabels = {
  draft: "Draft",
  processing: "Processing",
  published: "Published",
  moderated: "Hidden",
  deleted: "Deleted",
  failed: "Needs attention",
} as const

function MyPosts() {
  const posts = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-8 border-b pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">My posts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Edit drafts and manage published posts.
        </p>
      </header>

      {posts.length === 0 ? (
        <Empty className="min-h-64 border-y">
          <EmptyHeader>
            <EmptyTitle>No posts yet</EmptyTitle>
            <EmptyDescription>Your drafts and published posts will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="border-y">
          {posts.map((post) => {
            const destination = post.status === "published" ? "/post/$postId" : "/post/$postId/edit"
            return (
              <article
                key={post.id}
                className="grid gap-4 border-b py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  {post.status === "deleted" ? (
                    <p className="font-semibold break-words">{post.title}</p>
                  ) : (
                    <Link
                      to={destination}
                      params={{ postId: post.id }}
                      className="font-semibold break-words hover:underline"
                    >
                      {post.title}
                    </Link>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={post.status === "failed" ? "destructive" : "outline"}>
                      {statusLabels[post.status]}
                    </Badge>
                    <span className="capitalize">{post.type}</span>
                    <span>{post.visibility === "public" ? "Public" : "Unlisted"}</span>
                    <time dateTime={post.updatedAt.toISOString()}>
                      Updated {post.updatedAt.toLocaleDateString("en")}
                    </time>
                    <span>
                      {post.comments} {post.comments === 1 ? "comment" : "comments"}
                    </span>
                    <span>
                      {post.reactions} {post.reactions === 1 ? "reaction" : "reactions"}
                    </span>
                  </div>
                </div>
                {post.status === "deleted" ? null : (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    render={<Link to="/post/$postId/edit" params={{ postId: post.id }} />}
                  >
                    {post.status === "published" ? "Edit" : "Edit details"}
                  </Button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
