import { describe, expect, it } from "bun:test"

import type { PublicSitemapRecord } from "@/db/public-read-model"

import { buildRobotsTxt, buildSitemapXml } from "./sitemap"

const record: PublicSitemapRecord = {
  postId: "post&one",
  postUpdatedAt: new Date("2026-07-15T12:00:00.000Z"),
  username: "cute fox",
  profileUpdatedAt: new Date("2026-07-14T12:00:00.000Z"),
  tag: "art/memes",
}

describe("SEO discovery documents", () => {
  it("includes static pages and deduplicated public content", () => {
    const xml = buildSitemapXml("https://post.pistonmaster.net", [record, record])

    expect(xml).toContain("<loc>https://post.pistonmaster.net/</loc>")
    expect(xml).toContain("<loc>https://post.pistonmaster.net/migration</loc>")
    expect(xml).toContain("<loc>https://post.pistonmaster.net/post/post%26one</loc>")
    expect(xml).toContain("<loc>https://post.pistonmaster.net/user/cute%20fox</loc>")
    expect(xml).toContain("<loc>https://post.pistonmaster.net/tag/art%2Fmemes</loc>")
    expect(xml.match(/\/post\/post%26one/g)).toHaveLength(1)
    expect(xml).toContain("<lastmod>2026-07-15T12:00:00.000Z</lastmod>")
  })

  it("allows production crawlers while blocking private surfaces", () => {
    const robots = buildRobotsTxt("https://post.pistonmaster.net", true)
    expect(robots).toContain("Allow: /")
    expect(robots).toContain("Disallow: /account/")
    expect(robots).toContain("Sitemap: https://post.pistonmaster.net/sitemap.xml")
  })

  it("blocks non-production deployments", () => {
    expect(buildRobotsTxt("https://staging.post.pistonmaster.net", false)).toBe(
      "User-agent: *\nDisallow: /\n",
    )
  })
})
