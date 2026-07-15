import { describe, expect, it } from "bun:test"

import type { PublicPostRead } from "@/db/public-read-model"

import { createPostSeoHead } from "./post-seo"
import { createPostShareLinks } from "./post-share-links"
import { SITE_URL, absoluteUrl, createSeoHead, truncateDescription } from "./seo"

const basePost: PublicPostRead = {
  id: "post one",
  type: "text",
  title: "look at this",
  textContent: "A tiny post with enough personality for a useful description.",
  visibility: "public",
  publishedAt: new Date("2026-07-15T12:00:00.000Z"),
  author: { username: "alex", name: "Alex", image: null },
  media: [],
  tags: [{ slug: "friends", name: "friends" }],
  commentCount: 0,
  reactions: { like: 0, dislike: 0, heart: 0 },
}

function metaContent(
  meta: ReturnType<typeof createSeoHead>["meta"],
  key: "name" | "property",
  value: string,
) {
  const entry = meta.find((candidate) => {
    if (key === "name") return "name" in candidate && candidate.name === value
    return "property" in candidate && candidate.property === value
  })
  return entry && "content" in entry && typeof entry.content === "string"
    ? entry.content
    : undefined
}

describe("SEO metadata", () => {
  it("builds absolute canonical and social URLs", () => {
    const head = createSeoHead({
      title: "PistonPost",
      description: "Posts with friends.",
      path: "/tag/cute things",
    })

    expect(head.links).toEqual([{ rel: "canonical", href: `${SITE_URL}/tag/cute%20things` }])
    expect(metaContent(head.meta, "property", "og:url")).toBe(`${SITE_URL}/tag/cute%20things`)
    expect(metaContent(head.meta, "name", "twitter:title")).toBe("PistonPost")
    expect(metaContent(head.meta, "name", "twitter:creator")).toBe("@AlexProgrammer3")
  })

  it("keeps descriptions compact and readable", () => {
    expect(truncateDescription("  one\n\n two  ")).toBe("one two")
    expect(truncateDescription("abcdef", 5)).toBe("abcd…")
  })

  it("uses the selected gallery image for large social cards", () => {
    const post: PublicPostRead = {
      ...basePost,
      type: "images",
      textContent: null,
      media: [
        { id: "first", kind: "image", width: 800, height: 600, duration: null, altText: null },
        {
          id: "second",
          kind: "image",
          width: 900,
          height: 700,
          duration: null,
          altText: "A sleepy fox",
        },
      ],
    }
    const head = createPostSeoHead(post, 1)

    expect(metaContent(head.meta, "property", "og:image")).toBe(`${SITE_URL}/media/image/second/og`)
    expect(metaContent(head.meta, "property", "og:image:alt")).toBe("A sleepy fox")
    expect(metaContent(head.meta, "name", "twitter:card")).toBe("summary_large_image")
    expect(head.scripts[0]?.children).toContain(
      `"image":["${SITE_URL}/media/image/first/og","${SITE_URL}/media/image/second/og"]`,
    )
  })

  it("preserves author and tag context in post metadata", () => {
    const textHead = createPostSeoHead(basePost)
    const videoHead = createPostSeoHead({
      ...basePost,
      type: "video",
      textContent: null,
      media: [
        { id: "video-id", kind: "video", width: 1920, height: 1080, duration: 12, altText: null },
      ],
    })

    expect(metaContent(textHead.meta, "name", "description")).toContain("Post by Alex · #friends")
    expect(metaContent(videoHead.meta, "property", "og:title")).toBe(
      "look at this · Alex · PistonPost",
    )
  })

  it("builds the legacy multi-image share bundle with distinct social-card URLs", () => {
    const links = createPostShareLinks("post one", 8)

    expect(links.postUrl).toBe(`${SITE_URL}/post/post%20one`)
    expect(links.imageUrls).toHaveLength(5)
    expect(links.imageUrls[0]).toBe(`${SITE_URL}/post/post%20one?image=0`)
    expect(links.imageUrls[4]).toBe(`${SITE_URL}/post/post%20one?image=4`)
  })

  it("uses a direct MP4 for Open Graph and keeps the iframe player separate", () => {
    const post: PublicPostRead = {
      ...basePost,
      type: "video",
      textContent: null,
      media: [
        { id: "video-id", kind: "video", width: 1920, height: 1080, duration: 12, altText: null },
      ],
    }
    const head = createPostSeoHead(post)

    expect(metaContent(head.meta, "property", "og:type")).toBe("video.other")
    expect(metaContent(head.meta, "property", "og:video")).toBe(
      `${SITE_URL}/media/video/video-id/download`,
    )
    expect(metaContent(head.meta, "property", "og:video:type")).toBe("video/mp4")
    expect(metaContent(head.meta, "property", "og:image")).toBe(
      `${SITE_URL}/media/video/video-id/thumbnail`,
    )
    expect(metaContent(head.meta, "name", "twitter:card")).toBe("player")
    expect(metaContent(head.meta, "name", "twitter:player")).toBe(
      `${SITE_URL}/media/video/video-id/player`,
    )
    expect(metaContent(head.meta, "name", "twitter:player:width")).toBe("1920")
    expect(head.scripts[0]?.children).toContain(
      `"contentUrl":"${SITE_URL}/media/video/video-id/download"`,
    )
  })

  it("keeps unlisted posts out of indexes", () => {
    const head = createPostSeoHead({ ...basePost, visibility: "unlisted" })
    expect(metaContent(head.meta, "name", "robots")).toBe("noindex, nofollow")
    expect(absoluteUrl("/post/example")).toBe(`${SITE_URL}/post/example`)
  })

  it("escapes user text embedded in structured data", () => {
    const head = createSeoHead({
      title: "PistonPost",
      description: "Posts with friends.",
      path: "/",
      jsonLd: { "@context": "https://schema.org", name: "</script><script>alert(1)</script>" },
    })
    const script = head.scripts[0]

    expect(script?.children).not.toContain("</script>")
    expect(script?.children).toContain("\\u003c/script>")
  })
})
