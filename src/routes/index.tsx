import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Schema, Effect, Option } from "effect"
import { History, Newspaper, Plus, TriangleAlert } from "lucide-react"
import { Suspense, type ReactNode } from "react"

import { ButtonLink } from "@/components/ButtonLink"
import { FeedLoadError } from "@/components/FeedLoadError"
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
import { feedQueryOptions } from "@/lib/queries/posts"
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, createSeoHead } from "@/lib/seo"

const feedSearchSchema = Schema.Struct({
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))).pipe(
    Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined))),
  ),
})

export const Route = createFileRoute("/")({
  validateSearch: Schema.toStandardSchemaV1(feedSearchSchema, { parseOptions: { errors: "all" } }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: ({ context, deps }) => {
    void context.queryClient.infiniteQuery(feedQueryOptions({}, deps.cursor)).catch(() => undefined)
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
      // Older pages are reached through a cursor that expires, so keep them out of results.
      indexing: cursor ? "noindex-follow" : "index",
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
    <PublicFeedLayout>
      <Suspense fallback={<FeedItemsSkeleton />}>
        <PublicFeedResults />
      </Suspense>
    </PublicFeedLayout>
  )
}

function PublicFeedLayout({ children }: { readonly children: ReactNode }) {
  const { cursor } = Route.useSearch()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Timeline</h1>
        {cursor ? (
          <p className="text-sm text-muted-foreground">
            You are viewing older posts.{" "}
            <Link to="/" className="font-semibold text-primary underline-offset-4 hover:underline">
              Back to latest
            </Link>
          </p>
        ) : null}
      </header>
      {children}
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
          <AlertDescription>
            Showing posts already loaded in this tab. Reconnect to load more.
          </AlertDescription>
        </Alert>
      )}

      {posts.length === 0 && cursor ? (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No older posts here</EmptyTitle>
            <EmptyDescription>This link may be out of date.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ButtonLink render={<Link to="/" />}>
              <Newspaper aria-hidden="true" data-icon="inline-start" />
              Latest posts
            </ButtonLink>
          </EmptyContent>
        </Empty>
      ) : posts.length === 0 ? (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Newspaper aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No public posts yet</EmptyTitle>
            <EmptyDescription>Create the first post for this feed.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ButtonLink render={<Link to="/posts/new" />}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              Create a post
            </ButtonLink>
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
  const { cursor } = Route.useSearch()

  return (
    <PublicFeedLayout>
      <FeedLoadError latestLink={cursor ? <Link to="/" /> : undefined} />
    </PublicFeedLayout>
  )
}
