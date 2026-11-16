import { describe, expect, it } from "bun:test"

import { textPostCardUrl } from "./post-seo"

const post = {
  id: "post one",
  updatedAt: new Date("2026-07-16T12:00:00.000Z"),
  author: {
    id: "alex-user",
    username: "Alex",
    normalizedUsername: "alex",
    name: "Alex",
    image: null,
    searchIndexable: true,
  },
}

describe("text post card URL", () => {
  it("is stable for the same post and author", () => {
    expect(textPostCardUrl(post)).toBe(textPostCardUrl({ ...post, author: { ...post.author } }))
    expect(textPostCardUrl(post)).toStartWith("/media/post/post%20one/card?v=1784203200000-")
  })

  it("changes when the post or the author's shown name changes", () => {
    const original = textPostCardUrl(post)
    expect(textPostCardUrl({ ...post, updatedAt: new Date("2026-07-17T12:00:00.000Z") })).not.toBe(
      original,
    )
    expect(textPostCardUrl({ ...post, author: { ...post.author, name: "Alexandra" } })).not.toBe(
      original,
    )
    expect(textPostCardUrl({ ...post, author: { ...post.author, username: "alex2" } })).not.toBe(
      original,
    )
  })
})
