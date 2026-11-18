import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { Schema, Effect, Option } from "effect"
import { lazy, Suspense } from "react"

import { FeedLoadError } from "@/components/FeedLoadError"
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

const decodeTagParam = Schema.decodeUnknownOption(
  Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
)

/** Returns the lookup key for a tag URL segment, or null when no tag can match it. */
function normalizeTagParam(value: string) {
  return Option.match(decodeTagParam(value), {
    onNone: () => null,
    onSome: (tag) => tag.toLocaleLowerCase("en-US"),
  })
}

const feedSearchSchema = Schema.Struct({
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))).pipe(
    Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined))),
  ),
})

export const Route = createFileRoute("/tag/$tag")({
  validateSearch: Schema.toStandardSchemaV1(feedSearchSchema, { parseOptions: { errors: "all" } }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: async ({ context, params, deps }) => {
    const tag = normalizeTagParam(params.tag)
    if (!tag) throw notFound()
    // Start the feed without waiting for it, so the tag heading shows while posts load.
    void context.queryClient
      .infiniteQuery(feedQueryOptions({ tag }, deps.cursor))
      .catch(() => undefined)
    // oxlint-disable-next-line typescript/no-deprecated -- RouterQueryClient overrides ensureQueryData to stop loader retries; query() would skip that policy.
    const tagRead = await context.queryClient.ensureQueryData(tagQueryOptions(tag))
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
      indexing: !loaderData?.searchIndexable
        ? "noindex"
        : match.search.cursor
          ? "noindex-follow"
          : "index",
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
  errorComponent: TagFeedError,
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
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            data-view-transition-part="tag-name"
            className="min-w-0 font-heading text-3xl font-bold tracking-tight wrap-anywhere"
          >
            #{tag.displayName}
          </h1>
          {cursor ? (
            <p className="text-sm text-muted-foreground">
              You are viewing older posts.{" "}
              <Link
                to="/tag/$tag"
                params={{ tag: tag.normalizedName }}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                Back to latest
              </Link>
            </p>
          ) : null}
        </div>
        <Suspense fallback={<Skeleton className="h-9 w-20 shrink-0" />}>
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

function TagFeedError() {
  const { tag } = Route.useParams()
  const { cursor } = Route.useSearch()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 border-b pb-4">
        <h1 className="min-w-0 font-heading text-3xl font-bold tracking-tight wrap-anywhere">
          #{tag}
        </h1>
      </header>
      <FeedLoadError latestLink={cursor ? <Link to="/tag/$tag" params={{ tag }} /> : undefined} />
    </main>
  )
}
