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

import { DateTime } from "@/components/DateTime"
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
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
            <EmptyMedia variant="icon">
              <FileText aria-hidden="true" />
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
        <ItemGroup className="gap-0 border-y">
          {posts.map((post) => {
            const destination = post.status === "published" ? "/post/$postId" : "/post/$postId/edit"
            const status = statusDetails[post.status]
            const StatusIcon = status.icon
            return (
              <Item
                key={post.id}
                render={<article />}
                role="listitem"
                className="rounded-none border-x-0 border-t-0 px-1 py-5 last:border-b-0 sm:px-3"
                variant="outline"
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-none w-full wrap-anywhere">
                    {post.status === "deleted" ? (
                      <span dir="auto">{post.title}</span>
                    ) : (
                      <Link
                        to={destination}
                        params={{ postId: post.id }}
                        dir="auto"
                        className="hover:underline"
                      >
                        {post.title}
                      </Link>
                    )}
                  </ItemTitle>
                  <ItemDescription className="mt-1 line-clamp-none flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={post.status === "failed" ? "destructive" : "outline"}>
                      <StatusIcon aria-hidden="true" data-icon="inline-start" />
                      {status.label}
                    </Badge>
                    <span className="capitalize">{post.type}</span>
                    <span>{post.visibility === "public" ? "Public" : "Unlisted"}</span>
                    <span>
                      Updated <DateTime value={post.updatedAt} presentation="absolute" />
                    </span>
                    <span>
                      {post.comments} {post.comments === 1 ? "comment" : "comments"}
                    </span>
                    <span>
                      {post.hearts} {post.hearts === 1 ? "heart" : "hearts"}
                    </span>
                  </ItemDescription>
                </ItemContent>
                {post.status === "deleted" ? null : (
                  <ItemActions className="basis-full sm:basis-auto">
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={<Link to="/post/$postId/edit" params={{ postId: post.id }} />}
                    >
                      <Pencil aria-hidden="true" data-icon="inline-start" />
                      {post.status === "published" ? "Edit" : "Edit details"}
                    </Button>
                  </ItemActions>
                )}
              </Item>
            )
          })}
        </ItemGroup>
      )}
    </main>
  )
}
