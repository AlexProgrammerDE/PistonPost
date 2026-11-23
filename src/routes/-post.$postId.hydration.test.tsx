import { describe, expect, test } from "bun:test"

import { sessionOptions } from "@better-auth-ui/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { renderToString } from "react-dom/server"

import { authClient } from "@/auth/client"
import type { PublicPostRead } from "@/db/public-read-model"
import { postQueryOptions } from "@/lib/queries/posts"
import { discussionQueryOptions } from "@/lib/queries/social"

import { Route } from "./post.$postId"

const post = {
  id: "post-id",
  type: "text",
  title: "A text post",
  textContent: "Hello",
  visibility: "public",
  publishedAt: new Date("2026-11-01T12:00:00.000Z"),
  updatedAt: new Date("2026-11-01T12:00:00.000Z"),
  author: {
    id: "author-id",
    username: "moss",
    normalizedUsername: "moss",
    name: "Moss",
    image: null,
    searchIndexable: true,
  },
  media: [],
  tags: [],
  viewCount: 0,
  commentCount: 0,
  heartCount: 0,
  structuredComments: [],
} satisfies PublicPostRead

const rootRoute = createRootRoute()
// The detail component reads its params and search through the "/post/$postId" route ID.
const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/post/$postId",
    validateSearch: Route.options.validateSearch,
    component: Route.options.component,
  }),
])

async function renderBeforeHydration(queryClient: QueryClient) {
  queryClient.setQueryData(postQueryOptions(post.id).queryKey, post)
  queryClient.setQueryData(discussionQueryOptions(post.id).queryKey, {
    pages: [{ comments: [], nextCursor: null }],
    pageParams: [undefined],
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/post/${post.id}`] }),
    context: { queryClient },
  })
  await router.load()
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe("post detail", () => {
  test("renders the author's edit link only after hydration", async () => {
    // The server renders without a session. A session that the client already loaded must not
    // change the first render, or the post would not match the server HTML.
    const signedOut = await renderBeforeHydration(new QueryClient())
    const signedIn = new QueryClient()
    signedIn.setQueryData(sessionOptions(authClient).queryKey, {
      session: { id: "session-id", userId: post.author.id },
      user: { id: post.author.id, role: "user" },
    })

    expect(signedOut).toContain("A text post")
    expect(signedOut).not.toContain("/post/post-id/edit")
    expect(await renderBeforeHydration(signedIn)).toBe(signedOut)
  })
})
