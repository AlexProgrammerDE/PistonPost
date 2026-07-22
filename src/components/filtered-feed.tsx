import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { SearchX } from "lucide-react"

import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger"
import { PostTimeline } from "@/components/PostTimeline"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { feedPageHref } from "@/lib/feed-pagination"
import { feedQueryOptions, type FeedFilters } from "@/lib/queries/posts"

export function FilteredFeed({
  filters,
  emptyMessage,
  initialCursor,
  pagePath,
}: {
  readonly filters: FeedFilters
  readonly emptyMessage: string
  readonly initialCursor?: string
  readonly pagePath: string
}) {
  const feed = useSuspenseInfiniteQuery(feedQueryOptions(filters, initialCursor))
  const posts = feed.data.pages.flatMap((page) => page.posts)
  const feedIdentity = filters.tag ? `tag:${filters.tag}` : `user:${filters.username}`

  if (posts.length === 0) {
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="overflow-hidden">{emptyMessage}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <PostTimeline posts={posts} surface={filters.tag ? "tag" : "profile"} />
      <InfiniteScrollTrigger
        key={feedIdentity}
        hasNextPage={feed.hasNextPage}
        isFetching={feed.isFetching}
        isFetchingNextPage={feed.isFetchingNextPage}
        isFetchNextPageError={feed.isFetchNextPageError}
        isPaused={feed.fetchStatus === "paused"}
        nextPageHref={feedPageHref(pagePath, feed.data.pages.at(-1)?.nextCursor ?? undefined)}
        onLoadMore={feed.fetchNextPage}
      />
    </>
  )
}
