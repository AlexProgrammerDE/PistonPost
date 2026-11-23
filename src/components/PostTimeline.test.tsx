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
import { POST_TEXT_PREVIEW_GRAPHEME_LIMIT } from "@/lib/post-text-preview"

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

function renderBeforeHydration(
  queryClient: QueryClient,
  posts = [post],
  surface: "timeline" | "profile" = "timeline",
) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <PostTimeline posts={posts} surface={surface} />
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

  test("offers a separate read link only when the preview cuts the text short", () => {
    const shortPost = renderBeforeHydration(new QueryClient())
    const longPost = renderBeforeHydration(new QueryClient(), [
      { ...post, textContent: "a".repeat(POST_TEXT_PREVIEW_GRAPHEME_LIMIT + 1) },
    ])

    expect(shortPost).not.toContain("Read full post")
    expect(longPost).toContain("Read full post")
  })

  test("names the author on shared feeds but not on their own profile", () => {
    const timeline = renderBeforeHydration(new QueryClient())
    const profile = renderBeforeHydration(new QueryClient(), [post], "profile")

    expect(timeline).toContain("@moss")
    expect(timeline).toContain('aria-label="View Moss&#x27;s profile"')
    expect(profile).not.toContain("@moss")
    expect(profile).not.toContain("View Moss&#x27;s profile")
  })

  test("hides zero counts but keeps them in the action descriptions", () => {
    const quiet = renderBeforeHydration(new QueryClient())
    const busy = renderBeforeHydration(new QueryClient(), [
      { ...post, heartCount: 3, commentCount: 1 },
    ])

    expect(quiet).toContain("0 hearts")
    expect(quiet).toContain("0 comments")
    expect(quiet).not.toContain('<span class="tabular-nums">0</span>')
    expect(busy).toContain('<span class="tabular-nums">3</span>')
    expect(busy).toContain('<span class="tabular-nums">1</span>')
    expect(busy).toContain("1 comment<")
  })
})
