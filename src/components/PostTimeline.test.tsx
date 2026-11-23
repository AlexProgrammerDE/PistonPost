import { describe, expect, test } from "bun:test"

import { sessionOptions } from "@better-auth-ui/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router"
import { renderToString } from "react-dom/server"

import { authClient } from "@/auth/client"
import type { PublicPostRead } from "@/db/public-read-model"

import { PostTimeline } from "./PostTimeline"

const author = {
  id: "author-id",
  username: "moss",
  normalizedUsername: "moss",
  name: "Moss",
  image: null,
  searchIndexable: true,
}

const post: PublicPostRead = {
  id: "post-id",
  type: "text",
  title: "A text post",
  textContent: "Hello",
  visibility: "public",
  publishedAt: new Date("2026-11-01T12:00:00.000Z"),
  updatedAt: new Date("2026-11-01T12:00:00.000Z"),
  author,
  media: [],
  tags: [],
  viewCount: 0,
  commentCount: 0,
  heartCount: 0,
}

const imagePost: PublicPostRead = {
  ...post,
  id: "image-post-id",
  type: "images",
  title: "Garden haul",
  textContent: null,
  media: [
    {
      id: "image-id",
      kind: "image",
      width: 800,
      height: 600,
      duration: null,
      altText: "Three tomatoes on a wooden table",
    },
  ],
}

function renderBeforeHydration(queryClient: QueryClient, posts = [post]) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <PostTimeline posts={posts} surface="timeline" />
      </RouterContextProvider>
    </QueryClientProvider>,
  )
}

describe("PostTimeline", () => {
  test("renders the author's edit link only after hydration", () => {
    // The server renders without a session. A session that the client already loaded must not
    // change the first render, or a streamed feed would not match the server HTML.
    const signedOut = renderBeforeHydration(new QueryClient())
    const signedIn = new QueryClient()
    signedIn.setQueryData(sessionOptions(authClient).queryKey, {
      session: { id: "session-id", userId: author.id },
      user: { id: author.id, role: "user" },
    })

    expect(signedOut).not.toContain("/post/post-id/edit")
    expect(renderBeforeHydration(signedIn)).toBe(signedOut)
  })

  test("keeps the alt text of a single feed image in the link name", () => {
    // The link's own name replaces the image's alt text for screen readers.
    const html = renderBeforeHydration(new QueryClient(), [imagePost])

    expect(html).toContain('aria-label="Open Garden haul: Three tomatoes on a wooden table"')
  })
})
