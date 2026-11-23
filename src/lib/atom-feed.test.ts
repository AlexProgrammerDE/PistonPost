import { describe, expect, it } from "bun:test"

import type { PublicAtomFeedRecord } from "@/db/atom-feed-read-model"

import { buildAtomFeedXml } from "./atom-feed"

const records: readonly PublicAtomFeedRecord[] = [
  {
    id: "post/one & two",
    type: "text",
    title: "Cats & <dogs>\u0000",
    textContent: String.raw`Hello **friends** & \<neighbors\>.`,
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

  it("separates Markdown blocks and keeps the summary length limit", () => {
    const [first] = records
    if (!first) throw new Error("Missing fixture")
    const xml = buildAtomFeedXml("https://post.pistonmaster.net", [
      {
        ...first,
        textContent: `## What I've tried\n\n- Talking to it nicely\n- Unplugging it\n\n${"Still haunted ".repeat(40)}`,
      },
    ])
    const summary = /<summary type="text">(?<text>[^<]*)<\/summary>/u.exec(xml)?.groups?.["text"]

    expect(summary).toStartWith("What I&apos;ve tried: Talking to it nicely. Unplugging it. Still")
    expect(summary).toEndWith("…")
    expect(
      Array.from(new Intl.Segmenter().segment(summary?.replaceAll("&apos;", "'") ?? "")),
    ).toHaveLength(400)
  })

  it("uses the most recent modification as the feed timestamp", () => {
    const xml = buildAtomFeedXml("https://post.pistonmaster.net", records)

    expect(xml).toContain("<updated>2026-07-19T08:00:00.000Z</updated>")
    expect(xml.match(/<entry>/gu)).toHaveLength(2)
  })
})
