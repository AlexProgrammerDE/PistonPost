import { describe, expect, test } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router"
import { renderToString } from "react-dom/server"

import type { PublicPostRead } from "@/db/public-read-model"

import { PostView } from "./post-view"

const sizes = [
  { width: 600, height: 1200 },
  { width: 1200, height: 600 },
  { width: 1200, height: 600 },
  { width: 1200, height: 600 },
]

const galleryPost: PublicPostRead = {
  id: "gallery-post-id",
  type: "images",
  title: "Sketch dump",
  textContent: null,
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
  media: sizes.map(({ width, height }, index) => ({
    id: `image-${String(index + 1)}`,
    kind: "image",
    width,
    height,
    duration: null,
    altText: `Sketch ${String(index + 1)}`,
  })),
  tags: [],
  viewCount: 0,
  commentCount: 0,
  heartCount: 0,
}

function renderDetail() {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/post/gallery-post-id"] }),
  })
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <RouterContextProvider router={router}>
        <PostView post={galleryPost} detail galleryLayout="masonry" />
      </RouterContextProvider>
    </QueryClientProvider>,
  )
}

describe("PostView masonry gallery", () => {
  test("keeps images in post order while stacking short images beside a tall one", () => {
    const html = renderDetail()
    const labels = [...html.matchAll(/aria-label="Expand image (\d) of 4: Sketch \d"/gu)].map(
      (match) => match[1],
    )
    const twoColumnPlacements = [...html.matchAll(/--masonry-column-2:(\d)/gu)].map(
      (match) => match[1],
    )

    expect(labels).toEqual(["1", "2", "3", "4"])
    // The tall first image fills the left column while the wide images stack on the right.
    expect(twoColumnPlacements).toEqual(["1", "2", "2", "2"])
  })
})
