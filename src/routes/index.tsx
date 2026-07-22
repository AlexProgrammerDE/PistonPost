import { useQueryErrorResetBoundary, useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { Newspaper, Plus, RotateCcw, TriangleAlert } from "lucide-react"
import { Suspense, useEffect } from "react"
import { z } from "zod"

import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger"
import { FeedItemsSkeleton, FeedPageSkeleton } from "@/components/LoadingStates"
import { PostTimeline } from "@/components/PostTimeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { feedPageHref } from "@/lib/feed-pagination"
import { feedQueryOptions } from "@/lib/queries/posts"
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, createSeoHead } from "@/lib/seo"

const feedSearchSchema = z.object({
  cursor: z.string().max(512).optional().catch(undefined),
})

export const Route = createFileRoute("/")({
  validateSearch: feedSearchSchema,
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchInfiniteQuery(feedQueryOptions({}, deps.cursor))
  },
  head: ({ match }) => {
    const cursor = match.search.cursor
    const path = feedPageHref("/", cursor)
    const title = cursor ? `Older posts · ${SITE_NAME}` : SITE_NAME
    return createSeoHead({
      title,
      description: cursor ? `Older public posts on ${SITE_NAME}.` : SITE_DESCRIPTION,
      path,
      twitterCard: "summary_large_image",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": cursor ? "CollectionPage" : "WebSite",
        "@id": cursor ? absoluteUrl(path) : absoluteUrl("/#website"),
        name: title,
        alternateName: cursor ? undefined : "post.pistonmaster.net",
        url: absoluteUrl(path),
        description: cursor ? `Older public posts on ${SITE_NAME}.` : SITE_DESCRIPTION,
        inLanguage: "en",
      },
    })
  },
  component: PublicFeed,
  pendingComponent: FeedPageSkeleton,
  errorComponent: FeedError,
})

function PublicFeed() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-7">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Timeline</h1>
      </header>
      <Suspense fallback={<FeedItemsSkeleton />}>
        <PublicFeedResults />
      </Suspense>
    </main>
  )
}

function PublicFeedResults() {
  const { cursor } = Route.useSearch()
  const feed = useSuspenseInfiniteQuery(feedQueryOptions({}, cursor))
  const posts = feed.data.pages.flatMap((page) => page.posts)

  return (
    <>
      {feed.fetchStatus === "paused" && (
        <Alert className="mb-8">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>You are offline</AlertTitle>
          <AlertDescription>Showing the posts already stored in this browser.</AlertDescription>
        </Alert>
      )}

      {posts.length === 0 ? (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia>
              <Newspaper aria-hidden="true" className="size-8 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No public posts yet</EmptyTitle>
            <EmptyDescription>Create the first post for this feed.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/account/posts/new" />}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              Create a post
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PostTimeline posts={posts} surface="timeline" />
      )}

      <InfiniteScrollTrigger
        key="public-feed"
        hasNextPage={feed.hasNextPage}
        isFetching={feed.isFetching}
        isFetchingNextPage={feed.isFetchingNextPage}
        isFetchNextPageError={feed.isFetchNextPageError}
        isPaused={feed.fetchStatus === "paused"}
        nextPageHref={feedPageHref("/", feed.data.pages.at(-1)?.nextCursor ?? undefined)}
        onLoadMore={feed.fetchNextPage}
      />
    </>
  )
}

function FeedError() {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  function retry() {
    queryErrorResetBoundary.reset()
    void router.invalidate()
  }

  return (
    <main className="mx-auto grid min-h-[60svh] w-full max-w-2xl place-items-center px-4">
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>The feed could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-4">
          <span>Check your connection and try again.</span>
          <Button variant="outline" onClick={retry}>
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  )
}
