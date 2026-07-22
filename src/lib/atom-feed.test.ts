import { describe, expect, it } from "bun:test"

import type { PublicAtomFeedRecord } from "@/db/atom-feed-read-model"

import { buildAtomFeedXml } from "./atom-feed"

const records: ReadonlyArray<PublicAtomFeedRecord> = [
  {
    id: "post/one & two",
    type: "text",
    title: "Cats & <dogs>\u0000",
    textContent: "Hello **friends** & \\<neighbors\\>.",
    publishedAt: new Date("2026-07-18T12:00:00.000Z"),
    updatedAt: new Date("2026-07-18T12:30:00.000Z"),
    author: {
      name: "Alex & Friends",
      username: "Alex",
      normalizedUsername: "alex & friends",
    },
  },
  {
    id: "older-post",
    type: "images",
    title: "Older post",
    textContent: null,
    publishedAt: new Date("2026-07-17T12:00:00.000Z"),
    updatedAt: new Date("2026-07-19T08:00:00.000Z"),
    author: {
      name: "Bex",
      username: "Bex",
      normalizedUsername: "bex",
    },
  },
]

describe("Atom feed", () => {
  it("escapes user content and emits canonical post and author URLs", () => {
    const xml = buildAtomFeedXml("https://post.pistonmaster.net", records)

    expect(xml).toContain('<title type="text">Cats &amp; &lt;dogs&gt;</title>')
    expect(xml).toContain('<summary type="text">Hello friends &amp; &lt;neighbors&gt;.</summary>')
    expect(xml).toContain("https://post.pistonmaster.net/post/post%2Fone%20%26%20two")
    expect(xml).toContain("https://post.pistonmaster.net/user/alex%20%26%20friends")
    expect(xml).not.toContain("Cats & <dogs>")
  })

  it("uses the most recent modification as the feed timestamp", () => {
    const xml = buildAtomFeedXml("https://post.pistonmaster.net", records)

    expect(xml).toContain("<updated>2026-07-19T08:00:00.000Z</updated>")
    expect(xml.match(/<entry>/g)).toHaveLength(2)
  })
})
