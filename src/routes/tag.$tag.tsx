import { createFileRoute, notFound } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { z } from "zod"

import { FilteredFeed } from "@/components/filtered-feed"
import { FeedItemsSkeleton, FeedPageSkeleton } from "@/components/LoadingStates"
import { Skeleton } from "@/components/ui/skeleton"
import { feedPageHref } from "@/lib/feed-pagination"
import { feedQueryOptions, tagQueryOptions } from "@/lib/queries/posts"
import { absoluteUrl, createSeoHead } from "@/lib/seo"
import { activeSharedViewTransitionKind } from "@/lib/view-transitions"

const FollowButton = lazy(() =>
  import("@/components/FollowButton").then((module) => ({ default: module.FollowButton })),
)

const feedSearchSchema = z.object({
  cursor: z.string().max(512).optional().catch(undefined),
})

export const Route = createFileRoute("/tag/$tag")({
  validateSearch: feedSearchSchema,
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: async ({ context, params, deps }) => {
    const tag = z.string().trim().min(1).max(64).parse(params.tag).toLocaleLowerCase("en-US")
    const tagPromise = context.queryClient.ensureQueryData(tagQueryOptions(tag))
    const feedPromise = context.queryClient.prefetchInfiniteQuery(
      feedQueryOptions({ tag }, deps.cursor),
    )
    const [tagRead] = await Promise.all([tagPromise, feedPromise])
    if (!tagRead) throw notFound()
    return tagRead
  },
  head: ({ loaderData, params, match }) => {
    const normalizedTag = loaderData?.normalizedName ?? params.tag.toLocaleLowerCase("en-US")
    const displayName = loaderData?.displayName ?? params.tag
    const pagePath = `/tag/${encodeURIComponent(normalizedTag)}`
    const path = feedPageHref(pagePath, match.search.cursor)
    const description = `Latest PistonPost posts tagged #${displayName}.`
    return createSeoHead({
      title: `#${displayName} · PistonPost`,
      description,
      path,
      twitterCard: "summary",
      indexing: loaderData?.searchIndexable ? "index" : "noindex",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": absoluteUrl(path),
        url: absoluteUrl(path),
        name: `#${displayName}`,
        description,
      },
    })
  },
  component: TagFeed,
  pendingComponent: FeedPageSkeleton,
})

function TagFeed() {
  const tag = Route.useLoaderData()
  const { cursor } = Route.useSearch()
  const pagePath = `/tag/${encodeURIComponent(tag.normalizedName)}`
  const activeTransition = activeSharedViewTransitionKind({
    kind: "tag",
    tag: tag.normalizedName,
  })
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header
        data-view-transition-active={activeTransition}
        className="mb-8 flex items-center justify-between gap-4 border-b pb-4"
      >
        <h1
          data-view-transition-part="tag-name"
          className="overflow-hidden font-heading text-3xl font-bold tracking-tight"
        >
          #{tag.displayName}
        </h1>
        <Suspense fallback={<Skeleton className="h-9 w-20" />}>
          <FollowButton target={{ kind: "tag", tag: tag.normalizedName }} />
        </Suspense>
      </header>
      <Suspense fallback={<FeedItemsSkeleton />}>
        <FilteredFeed
          filters={{ tag: tag.normalizedName }}
          emptyMessage={`No public posts use #${tag.displayName}.`}
          initialCursor={cursor}
          pagePath={pagePath}
        />
      </Suspense>
    </main>
  )
}
