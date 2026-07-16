import { useSuspenseInfiniteQuery } from "@tanstack/react-query"

import { PostTimeline } from "@/components/PostTimeline"
import { Button } from "@/components/ui/button"
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
