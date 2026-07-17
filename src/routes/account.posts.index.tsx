import { Link, createFileRoute } from "@tanstack/react-router"
import {
  CircleCheck,
  EyeOff,
  FilePenLine,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { ManagementPageSkeleton } from "@/components/LoadingStates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getMyPosts } from "@/server/tables"

export const Route = createFileRoute("/account/posts/")({
  loader: () => getMyPosts(),
  head: () => ({
    meta: [{ title: "My posts · PistonPost" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: MyPosts,
  pendingComponent: ManagementPageSkeleton,
})

const statusDetails = {
  draft: { icon: FilePenLine, label: "Draft" },
  processing: { icon: LoaderCircle, label: "Processing" },
  published: { icon: CircleCheck, label: "Published" },
  moderated: { icon: EyeOff, label: "Hidden" },
  deleted: { icon: Trash2, label: "Deleted" },
  failed: { icon: TriangleAlert, label: "Needs attention" },
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
            <EmptyMedia>
              <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No posts yet</EmptyTitle>
            <EmptyDescription>Your drafts and published posts will appear here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/account/posts/new" />}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              Create a post
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border-y">
          {posts.map((post) => {
            const destination = post.status === "published" ? "/post/$postId" : "/post/$postId/edit"
            const status = statusDetails[post.status]
            const StatusIcon = status.icon
            return (
              <article
                key={post.id}
                className="grid gap-4 border-b py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  {post.status === "deleted" ? (
                    <p dir="auto" className="font-semibold wrap-anywhere">
                      {post.title}
                    </p>
                  ) : (
                    <Link
                      to={destination}
                      params={{ postId: post.id }}
                      dir="auto"
                      className="font-semibold wrap-anywhere hover:underline"
                    >
                      {post.title}
                    </Link>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={post.status === "failed" ? "destructive" : "outline"}>
                      <StatusIcon aria-hidden="true" data-icon="inline-start" />
                      {status.label}
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
                    <Pencil aria-hidden="true" data-icon="inline-start" />
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
