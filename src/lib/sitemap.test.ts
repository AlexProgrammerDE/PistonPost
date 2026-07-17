import { describe, expect, it } from "bun:test"

import type { PublicPostSitemapRecord } from "@/db/public-read-model"

import {
  SITEMAP_PAGE_SIZE,
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
      posts: SITEMAP_PAGE_SIZE + 1,
      profiles: 1,
      tags: 0,
    })

    expect(sitemapPageCount(SITEMAP_PAGE_SIZE + 1)).toBe(2)
    expect(xml.match(/\/sitemaps\/posts\//g)).toHaveLength(2)
    expect(xml).toContain("<loc>https://post.pistonmaster.net/sitemaps/profiles/1</loc>")
    expect(xml).not.toContain("/sitemaps/tags/")
  })

  it("exposes crawlable image and video records with correct duration units", () => {
    const xml = buildPostSitemapXml("https://post.pistonmaster.net", [post])

    expect(xml).toContain("<loc>https://post.pistonmaster.net/post/post%26one</loc>")
    expect(xml).toContain(
      "<image:loc>https://post.pistonmaster.net/media/image/image%20one/detail</image:loc>",
    )
    expect(xml).toContain("<video:title>Cats &amp; dogs</video:title>")
    expect(xml).toContain("<video:duration>10</video:duration>")
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
