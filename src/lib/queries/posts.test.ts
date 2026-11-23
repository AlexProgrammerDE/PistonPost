import { describe, expect, test } from "bun:test"

import { QueryClient, type InfiniteData } from "@tanstack/react-query"

import type { PublicPostRead } from "@/db/public-read-model"

import {
  feedQueryOptions,
  followingFeedQueryOptions,
  ownedUnlistedPostsQueryOptions,
  postQueryOptions,
  refreshAfterPostChange,
  setCachedPostHeartCount,
} from "./posts"

function post(id: string, heartCount: number) {
  return {
    id,
    type: "text",
    title: `Post ${id}`,
    textContent: "Hello",
    visibility: "unlisted",
    publishedAt: new Date("2026-11-01T12:00:00.000Z"),
    updatedAt: new Date("2026-11-01T12:00:00.000Z"),
    author: {
      id: "owner-id",
      username: "owner",
      normalizedUsername: "owner",
      name: "Owner",
      image: null,
      searchIndexable: true,
    },
    media: [],
    tags: [],
    viewCount: 0,
    commentCount: 0,
    heartCount,
    structuredComments: [],
  } satisfies PublicPostRead
}

type Page = { readonly posts: readonly PublicPostRead[]; readonly nextCursor: string | null }

function feed(posts: readonly PublicPostRead[]): InfiniteData<Page, string | undefined> {
  return { pages: [{ posts, nextCursor: null }], pageParams: [undefined] }
}

function heartCounts(queryClient: QueryClient, queryKey: readonly unknown[]) {
  return queryClient
    .getQueryData<InfiniteData<Page>>(queryKey)
    ?.pages.flatMap((page) => page.posts.map((cached) => [cached.id, cached.heartCount]))
}

describe("setCachedPostHeartCount", () => {
  test("updates the post in every loaded feed, including the owner's unlisted posts", () => {
    const queryClient = new QueryClient()
    const keys = [
      feedQueryOptions().queryKey,
      followingFeedQueryOptions("owner-id").queryKey,
      ownedUnlistedPostsQueryOptions("owner-id", "owner").queryKey,
    ]
    for (const queryKey of keys) {
      queryClient.setQueryData(queryKey, feed([post("hearted", 0), post("other", 4)]))
    }

    setCachedPostHeartCount(queryClient, "hearted", 1)

    for (const queryKey of keys) {
      expect(heartCounts(queryClient, queryKey)).toEqual([
        ["hearted", 1],
        ["other", 4],
      ])
    }
  })
})

describe("refreshAfterPostChange", () => {
  test("drops the cached post so the detail loader cannot return the old copy", async () => {
    const queryClient = new QueryClient()
    const postKey = postQueryOptions("edited").queryKey
    const otherKey = postQueryOptions("other").queryKey
    queryClient.setQueryData(postKey, post("edited", 0))
    queryClient.setQueryData(otherKey, post("other", 0))

    await refreshAfterPostChange(queryClient, "edited")

    // The detail loader uses ensureQueryData, which returns any cached data, even stale data.
    expect(queryClient.getQueryState(postKey)).toBeUndefined()
    expect(queryClient.getQueryData(otherKey)?.id).toBe("other")
  })

  test("marks loaded feeds stale", async () => {
    const queryClient = new QueryClient()
    const feedKey = feedQueryOptions().queryKey
    queryClient.setQueryData(feedKey, feed([post("edited", 0)]))

    await refreshAfterPostChange(queryClient, "edited")

    expect(queryClient.getQueryState(feedKey)?.isInvalidated).toBe(true)
  })
})
