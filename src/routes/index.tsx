import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { TriangleAlert } from "lucide-react"
import { Suspense } from "react"

import { FeedItemsSkeleton, FeedPageSkeleton } from "@/components/LoadingStates"
import { PostTimeline } from "@/components/PostTimeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { feedQueryOptions } from "@/lib/queries/posts"
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    void context.queryClient.prefetchInfiniteQuery(feedQueryOptions())
  },
  head: () =>
    createSeoHead({
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      path: "/",
      twitterCard: "summary_large_image",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        name: SITE_NAME,
        alternateName: "post.pistonmaster.net",
        url: absoluteUrl("/"),
        description: SITE_DESCRIPTION,
        inLanguage: "en",
      },
    }),
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
  const feed = useSuspenseInfiniteQuery(feedQueryOptions())
  const posts = feed.data.pages.flatMap((page) => page.posts)

  return (
    <>
      {feed.fetchStatus === "paused" && (
        <Alert className="mb-8">
          <TriangleAlert />
          <AlertTitle>You are offline</AlertTitle>
          <AlertDescription>Showing the posts already stored in this browser.</AlertDescription>
        </Alert>
      )}

      {posts.length === 0 ? (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyTitle>No public posts yet</EmptyTitle>
            <EmptyDescription>Create the first post for this feed.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/account/posts/new" />}>
              Create a post
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PostTimeline posts={posts} />
      )}

      {feed.hasNextPage && (
        <div className="mt-10 flex justify-center">
          <Button
            variant="outline"
            disabled={feed.isFetchingNextPage}
            onClick={() => feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? "Loading posts…" : "Load older posts"}
          </Button>
        </div>
      )}
    </>
  )
}

function FeedError({ reset }: { readonly error: Error; readonly reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-[60svh] w-full max-w-2xl place-items-center px-4">
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>The feed could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-4">
          <span>Check your connection and try again.</span>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  )
}
