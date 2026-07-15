import { useSuspenseInfiniteQuery } from "@tanstack/react-query"

import { PostView } from "@/components/post-view"
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
  const firstPostId = posts[0]?.id

  if (posts.length === 0) {
    return (
      <Empty className="min-h-64 border-y">
        <EmptyHeader>
          <EmptyTitle>{emptyMessage}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <div className="grid gap-10">
        {posts.map((post) => (
          <PostView key={post.id} post={post} priority={post.id === firstPostId} />
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
