import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { History, LogIn, Newspaper, TriangleAlert, UsersRound } from "lucide-react"
import { Suspense } from "react"

import { ButtonLink } from "@/components/ButtonLink"
import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger"
import { FeedItemsSkeleton, FeedPageSkeleton } from "@/components/LoadingStates"
import { PostTimeline } from "@/components/PostTimeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { feedPageHref } from "@/lib/feed-pagination"
import { followingFeedQueryOptions } from "@/lib/queries/posts"
import { getFollowingViewer } from "@/server/follows"

const feedSearchSchema = Schema.Struct({
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))).pipe(
    Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined))),
  ),
})

export const Route = createFileRoute("/following")({
  validateSearch: Schema.toStandardSchemaV1(feedSearchSchema, { parseOptions: { errors: "all" } }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: async ({ context, deps }) => {
    const viewer = await getFollowingViewer()
    if (viewer) {
      void context.queryClient.prefetchInfiniteQuery(
        followingFeedQueryOptions(viewer.id, deps.cursor),
      )
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
  const { cursor } = Route.useSearch()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Following</h1>
        {viewer && cursor ? (
          <p className="text-sm text-muted-foreground">
            You are viewing older posts.{" "}
            <Link
              to="/following"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Back to latest
            </Link>
          </p>
        ) : null}
      </header>
      {viewer ? (
        <Suspense fallback={<FeedItemsSkeleton />}>
          <FollowingFeedResults viewerId={viewer.id} />
        </Suspense>
      ) : (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Sign in to see your Following feed</EmptyTitle>
            <EmptyDescription>
              Follow people and tags to keep their posts together here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ButtonLink
              render={
                <Link
                  to="/auth/$authView"
                  params={{ authView: "sign-in" }}
                  search={{ redirectTo: "/following" }}
                />
              }
            >
              <LogIn aria-hidden="true" data-icon="inline-start" />
              Sign in
            </ButtonLink>
          </EmptyContent>
        </Empty>
      )}
    </main>
  )
}

function FollowingFeedResults({ viewerId }: { readonly viewerId: string }) {
  const { cursor } = Route.useSearch()
  const feed = useSuspenseInfiniteQuery(followingFeedQueryOptions(viewerId, cursor))
  const posts = feed.data.pages.flatMap((page) => page.posts)

  if (posts.length === 0 && cursor) {
    return (
      <Empty className="min-h-80">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No older posts here</EmptyTitle>
          <EmptyDescription>This link may be out of date.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ButtonLink render={<Link to="/following" />}>
            <Newspaper aria-hidden="true" data-icon="inline-start" />
            Latest posts
          </ButtonLink>
        </EmptyContent>
      </Empty>
    )
  }

  if (posts.length === 0) {
    return (
      <Empty className="min-h-80">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRound aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Your Following feed is empty</EmptyTitle>
          <EmptyDescription>
            Follow someone or a tag, then their public posts will appear here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ButtonLink variant="outline" render={<Link to="/" />}>
            <Newspaper aria-hidden="true" data-icon="inline-start" />
            Browse the timeline
          </ButtonLink>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <>
      {feed.fetchStatus === "paused" && (
        <Alert className="mb-8">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>You are offline</AlertTitle>
          <AlertDescription>
            Showing posts already loaded in this tab. Reconnect to load more.
          </AlertDescription>
        </Alert>
      )}
      <PostTimeline posts={posts} surface="following" />
      <InfiniteScrollTrigger
        key={`following:${viewerId}:${cursor ?? ""}`}
        hasNextPage={feed.hasNextPage}
        isFetching={feed.isFetching}
        isFetchingNextPage={feed.isFetchingNextPage}
        isFetchNextPageError={feed.isFetchNextPageError}
        isPaused={feed.fetchStatus === "paused"}
        nextPageHref={feedPageHref("/following", feed.data.pages.at(-1)?.nextCursor ?? undefined)}
        onLoadMore={feed.fetchNextPage}
      />
    </>
  )
}
