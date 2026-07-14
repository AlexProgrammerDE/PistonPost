import { Alert, AlertDescription, AlertTitle } from "@pistonpost/ui/components/alert"
import { Button } from "@pistonpost/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@pistonpost/ui/components/empty"
import { Skeleton } from "@pistonpost/ui/components/skeleton"
import { generateN } from "@pistonpost/ui/lib/generate-n"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"

import { TriangleAlert } from "@/components/icons"
import { PostView } from "@/components/post-view"
import { feedQueryOptions } from "@/lib/queries/posts"

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(feedQueryOptions()),
  component: PublicFeed,
  pendingComponent: FeedSkeleton,
  errorComponent: FeedError,
})

function PublicFeed() {
  const feed = useSuspenseInfiniteQuery(feedQueryOptions())
  const posts = feed.data.pages.flatMap((page) => page.posts)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 border-b pb-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Latest</h1>
      </header>

      {feed.fetchStatus === "paused" && (
        <Alert className="mb-8">
          <TriangleAlert />
          <AlertTitle>You are offline</AlertTitle>
          <AlertDescription>Showing the posts already stored in this browser.</AlertDescription>
        </Alert>
      )}

      {posts.length === 0 ? (
        <Empty className="min-h-96 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>No public posts yet</EmptyTitle>
            <EmptyDescription>Nothing has been posted yet.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/account/posts/new" />}>
              Create a post
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-10">
          {posts.map((post) => (
            <PostView key={post.id} post={post} />
          ))}
        </div>
      )}

      {feed.hasNextPage && (
        <div className="mt-12 flex justify-center border-t pt-8">
          <Button
            variant="outline"
            disabled={feed.isFetchingNextPage}
            onClick={() => feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? "Loading posts…" : "Load older posts"}
          </Button>
        </div>
      )}
    </main>
  )
}

function FeedSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Skeleton className="mb-8 h-8 w-24" />
      <div className="grid gap-10">
        {generateN(4).map((identity) => (
          <div key={identity} className="flex flex-col gap-4 border-b pb-10">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-8 w-40" />
            </div>
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="aspect-[4/3] w-full" />
          </div>
        ))}
      </div>
    </main>
  )
}

function FeedError({ error, reset }: { readonly error: Error; readonly reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-[60svh] w-full max-w-2xl place-items-center px-4">
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>The feed could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-4">
          <span>{error.message}</span>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  )
}
