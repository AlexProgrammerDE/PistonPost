import { useSuspenseInfiniteQuery } from "@tanstack/react-query"

import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger"
import { PostTimeline } from "@/components/PostTimeline"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { feedQueryOptions, type FeedFilters } from "@/lib/queries/posts"

export function FilteredFeed({
  filters,
  emptyMessage,
}: {
  readonly filters: FeedFilters
  readonly emptyMessage: string
}) {
  const feed = useSuspenseInfiniteQuery(feedQueryOptions(filters))
  const posts = feed.data.pages.flatMap((page) => page.posts)

  if (posts.length === 0) {
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyTitle>{emptyMessage}</EmptyTitle>
        </EmptyHeader>
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
