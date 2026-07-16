import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { LogIn, Newspaper, UsersRound } from "lucide-react"
import { Suspense } from "react"

import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger"
import { FeedItemsSkeleton, FeedPageSkeleton } from "@/components/LoadingStates"
import { PostTimeline } from "@/components/PostTimeline"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { followingFeedQueryOptions } from "@/lib/queries/posts"
import { getFollowingViewer } from "@/server/follows"

export const Route = createFileRoute("/following")({
  loader: async ({ context }) => {
    const viewer = await getFollowingViewer()
    if (viewer) {
      void context.queryClient.prefetchInfiniteQuery(followingFeedQueryOptions(viewer.id))
    }
    return viewer
  },
  head: () => ({
    meta: [{ title: "Following · PistonPost" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: FollowingFeed,
  pendingComponent: FeedPageSkeleton,
})

function FollowingFeed() {
  const viewer = Route.useLoaderData()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-7">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Following</h1>
      </header>
      {viewer ? (
        <Suspense fallback={<FeedItemsSkeleton />}>
          <FollowingFeedResults viewerId={viewer.id} />
        </Suspense>
      ) : (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia>
              <UsersRound aria-hidden="true" className="size-8 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>Sign in to see your Following feed</EmptyTitle>
            <EmptyDescription>
              Follow people and tags to keep their posts together here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              nativeButton={false}
              render={<Link to="/auth/$authView" params={{ authView: "sign-in" }} />}
            >
              <LogIn aria-hidden="true" data-icon="inline-start" />
              Sign in
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </main>
  )
}

function FollowingFeedResults({ viewerId }: { readonly viewerId: string }) {
  const feed = useSuspenseInfiniteQuery(followingFeedQueryOptions(viewerId))
  const posts = feed.data.pages.flatMap((page) => page.posts)

  if (posts.length === 0) {
    return (
      <Empty className="min-h-80">
        <EmptyHeader>
          <EmptyMedia>
            <UsersRound aria-hidden="true" className="size-8 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>Your Following feed is empty</EmptyTitle>
          <EmptyDescription>
            Follow someone or a tag, then their public posts will appear here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
            <Newspaper aria-hidden="true" data-icon="inline-start" />
            Browse the timeline
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <>
      <PostTimeline posts={posts} />
      <InfiniteScrollTrigger
        hasNextPage={feed.hasNextPage}
        isFetching={feed.isFetching}
        isFetchingNextPage={feed.isFetchingNextPage}
        isFetchNextPageError={feed.isFetchNextPageError}
        isPaused={feed.fetchStatus === "paused"}
        onLoadMore={feed.fetchNextPage}
      />
    </>
  )
}
