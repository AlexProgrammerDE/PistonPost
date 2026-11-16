"use client"

import { useSession } from "@better-auth-ui/react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useHydrated } from "@tanstack/react-router"
import { ChevronDown, Lock } from "lucide-react"
import { useId } from "react"

import { authClient } from "@/auth/client"
import { PostTimeline } from "@/components/PostTimeline"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ownedUnlistedPostsQueryOptions } from "@/lib/queries/posts"

/**
 * Lists the viewer's own unlisted posts on their profile. The server and the first client render
 * show nothing, so the public profile HTML stays the same for every visitor. Other visitors, and an
 * owner without unlisted posts, never see the section.
 */
export function OwnedUnlistedPosts({ username }: { readonly username: string }) {
  const headingId = useId()
  const hydrated = useHydrated()
  const session = useSession(authClient)
  const viewerId = hydrated && !session.isPending ? (session.data?.user.id ?? null) : null
  const feed = useInfiniteQuery({
    ...ownedUnlistedPostsQueryOptions(viewerId ?? "anonymous", username),
    enabled: viewerId !== null,
  })
  const posts = feed.data?.pages.flatMap((page) => page.posts) ?? []

  if (viewerId === null || posts.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="mb-10 border-b">
      <header className="mb-6 flex flex-col gap-1">
        <h2
          id={headingId}
          className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight"
        >
          <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
          Only you can see these
        </h2>
        <p className="text-sm text-muted-foreground">
          Unlisted posts. Anyone with the link can view them.
        </p>
      </header>
      <PostTimeline posts={posts} surface="profile" />
      {/* Load more on request, so a long list does not push the public posts out of reach. */}
      {feed.hasNextPage ? (
        <div className="mb-10 flex justify-center">
          <Button
            variant="outline"
            aria-busy={feed.isFetchingNextPage}
            onClick={() => {
              if (!feed.isFetchingNextPage) void feed.fetchNextPage()
            }}
          >
            {feed.isFetchingNextPage ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ChevronDown aria-hidden="true" data-icon="inline-start" />
            )}
            Show more unlisted posts
          </Button>
        </div>
      ) : null}
    </section>
  )
}
