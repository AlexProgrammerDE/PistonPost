import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { SearchX } from "lucide-react"

import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger"
import { PostTimeline } from "@/components/PostTimeline"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
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
  const feedIdentity = filters.tag ? `tag:${filters.tag}` : `user:${filters.username}`

  if (posts.length === 0) {
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyMedia>
            <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>{emptyMessage}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <PostTimeline posts={posts} />
      <InfiniteScrollTrigger
        key={feedIdentity}
        hasNextPage={feed.hasNextPage}
        loadedPageCount={feed.data.pages.length}
        isFetching={feed.isFetching}
        isFetchingNextPage={feed.isFetchingNextPage}
        isFetchNextPageError={feed.isFetchNextPageError}
        isPaused={feed.fetchStatus === "paused"}
        onLoadMore={feed.fetchNextPage}
      />
    </>
  )
}
