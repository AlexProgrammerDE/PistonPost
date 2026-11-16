import { describe, expect, it } from "bun:test"

import type { PublicPostSitemapRecord } from "@/db/public-read-model"

import {
  SITEMAP_PAGE_SIZES,
  buildPostSitemapXml,
  buildRobotsTxt,
  buildSitemapIndexXml,
  buildStaticSitemapXml,
  sitemapPageCount,
} from "./sitemap"

const post: PublicPostSitemapRecord = {
  id: "post&one",
  title: "Cats & dogs",
  type: "video",
  publishedAt: new Date("2026-07-15T12:00:00.000Z"),
  updatedAt: new Date("2026-07-16T12:00:00.000Z"),
  media: [
    { id: "image one", kind: "image", duration: null },
    { id: "video-one", kind: "video", duration: 9_700 },
  ],
}

describe("SEO discovery documents", () => {
  it("splits discovery into bounded sitemap pages", () => {
    const xml = buildSitemapIndexXml("https://post.pistonmaster.net", {
      posts: SITEMAP_PAGE_SIZES.posts + 1,
      profiles: SITEMAP_PAGE_SIZES.posts + 1,
      tags: 0,
    })

    expect(sitemapPageCount("posts", SITEMAP_PAGE_SIZES.posts + 1)).toBe(2)
    expect(sitemapPageCount("profiles", SITEMAP_PAGE_SIZES.posts + 1)).toBe(1)
    expect(xml.match(/\/sitemaps\/posts\//g)).toHaveLength(2)
    expect(xml).toContain("<loc>https://post.pistonmaster.net/sitemaps/profiles/1</loc>")
    expect(xml).not.toContain("/sitemaps/tags/")
  })

  it("exposes crawlable image and video records with correct duration units", () => {
    const xml = buildPostSitemapXml("https://post.pistonmaster.net", [post])

    expect(xml).toContain("<loc>https://post.pistonmaster.net/post/post%26one</loc>")
    expect(xml).toContain(
      "<image:loc>https://post.pistonmaster.net/media/image/image%20one/feed?v=1</image:loc>",
    )
    expect(xml).toContain("<video:title>Cats &amp; dogs</video:title>")
    expect(xml).toContain("<video:duration>10</video:duration>")
    expect(xml).toContain(
      "<video:thumbnail_loc>https://post.pistonmaster.net/media/video/video-one/thumbnail?v=5</video:thumbnail_loc>",
    )
    expect(xml).toContain(
      '<video:player_loc allow_embed="yes">https://post.pistonmaster.net/media/video/video-one/player?v=3</video:player_loc>',
    )
  })

  it("keeps a full page of posts with maximum images under the 50 MB sitemap limit", () => {
    const records = Array.from({ length: SITEMAP_PAGE_SIZES.posts }, (_, index) => ({
      ...post,
      id: `post-${index.toString().padStart(8, "0")}`,
      type: "images" as const,
      media: Array.from({ length: 150 }, (__, imageIndex) => ({
        id: `00000000-0000-4000-8000-${index.toString().padStart(6, "0")}${imageIndex.toString().padStart(6, "0")}`,
        kind: "image" as const,
        duration: null,
      })),
    }))
    const xml = buildPostSitemapXml("https://post.pistonmaster.net", records)

    expect(new TextEncoder().encode(xml).byteLength).toBeLessThan(50 * 1024 * 1024)
  })

  it("removes characters that XML 1.0 does not allow", () => {
    const xml = buildPostSitemapXml("https://post.pistonmaster.net", [
      { ...post, title: "Cats\u0001 \uFFFE& dogs" },
    ])

    expect(xml).toContain("<video:title>Cats &amp; dogs</video:title>")
    expect(xml).not.toContain("\u0001")
    expect(xml).not.toContain("\uFFFE")
  })

  it("keeps static pages in their own sitemap", () => {
    const xml = buildStaticSitemapXml("https://post.pistonmaster.net")
    expect(xml.match(/<url>/g)).toHaveLength(4)
    expect(xml).toContain("<loc>https://post.pistonmaster.net/terms</loc>")
  })

  it("lets crawlers read noindex HTML while blocking mutation surfaces", () => {
    const robots = buildRobotsTxt("https://post.pistonmaster.net", true)
    expect(robots).toContain("Allow: /")
    expect(robots).not.toContain("Disallow: /account/")
    expect(robots).not.toContain("Disallow: /admin/")
    expect(robots).not.toContain("Disallow: /auth/")
    expect(robots).toContain("Disallow: /api/")
    expect(robots).toContain("Sitemap: https://post.pistonmaster.net/sitemap.xml")
  })

  it("blocks non-production deployments", () => {
    expect(buildRobotsTxt("https://staging.post.pistonmaster.net", false)).toBe(
      "User-agent: *\nDisallow: /\n",
    )
  })
})
