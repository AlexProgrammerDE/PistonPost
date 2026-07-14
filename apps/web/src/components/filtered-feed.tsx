import { Button } from "@pistonpost/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@pistonpost/ui/components/empty"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"

import { TriangleAlert } from "@/components/icons"
import { PostView } from "@/components/post-view"
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
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <div className="grid gap-10">
        {posts.map((post) => (
          <PostView key={post.id} post={post} />
        ))}
      </div>
      {feed.hasNextPage && (
        <div className="mt-12 flex justify-center border-t pt-8">
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
