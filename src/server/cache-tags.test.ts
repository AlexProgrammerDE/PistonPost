import { describe, expect, it } from "bun:test"

import {
  cacheTagHeader,
  isCacheTag,
  mediaCacheTag,
  ownerCacheTag,
  postCacheTag,
} from "./cache-tags"

describe("Workers Cache tags", () => {
  it("encodes record identities into valid purge tags", () => {
    const tags = [
      mediaCacheTag("image, one"),
      ownerCacheTag("Björk Example"),
      postCacheTag("post/one"),
    ]

    expect(tags.every(isCacheTag)).toBeTrue()
    expect(tags).toEqual([
      "pistonpost-media-image%2C%20one",
      "pistonpost-owner-Bj%C3%B6rk%20Example",
      "pistonpost-post-post%2Fone",
    ])
  })

  it("deduplicates headers and rejects values Cloudflare would silently drop", () => {
    expect(cacheTagHeader(["pistonpost-feed", "pistonpost-feed", "pistonpost-sitemap"])).toBe(
      "pistonpost-feed,pistonpost-sitemap",
    )
    expect(() => cacheTagHeader(["invalid tag"])).toThrow()
    expect(() => cacheTagHeader(["invalid,tag"])).toThrow()
  })
})
