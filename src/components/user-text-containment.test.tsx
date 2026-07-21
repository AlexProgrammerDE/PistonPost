import { describe, expect, test } from "bun:test"

import type { PublicPostRead } from "@/db/public-read-model"

import { PostView } from "./post-view"

const post: PublicPostRead = {
  id: "post-123",
  type: "text",
  title: `T${"\u0300".repeat(99)}`,
  textContent: `H${"\u0300".repeat(999)}`,
  visibility: "public",
  publishedAt: new Date("2026-07-17T00:00:00.000Z"),
  updatedAt: new Date("2026-07-17T00:00:00.000Z"),
  author: {
    username: "author",
    normalizedUsername: "author",
    name: `A${"\u0300".repeat(99)}`,
    image: null,
    searchIndexable: true,
  },
  media: [],
  tags: [],
  viewCount: 0,
  commentCount: 0,
  heartCount: 0,
}

describe("user text containment", () => {
  test("clips feed and detail post titles to their heading boxes", () => {
    const feed = PostView({ post })
    const detail = PostView({ post, detail: true })
    const feedTitle = feed.props.children[1].props.children[0]
    const detailTitle = detail.props.children[1].props.children[0]

    expect(feedTitle.type).toBe("h2")
    expect(feedTitle.props.className).toContain("overflow-hidden")
    expect(detailTitle.type).toBe("h1")
    expect(detailTitle.props.className).toContain("overflow-hidden")
  })
})
