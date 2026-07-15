import { describe, expect, it } from "bun:test"

import {
  PRIVATE_CACHE_CONTROL,
  PUBLIC_CACHE_CONTROL,
  applyResponseCachePolicy,
} from "./cache-policy"

describe("applyResponseCachePolicy", () => {
  it("caches anonymous public documents and varies viewer-bearing headers", () => {
    const response = applyResponseCachePolicy(
      new Request("https://post.pistonmaster.net/post/example"),
      new Response("post"),
    )

    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_CACHE_CONTROL)
    expect(response.headers.get("Vary")).toContain("Cookie")
    expect(response.headers.get("Vary")).toContain("Authorization")
  })

  it("keeps authenticated reads private", () => {
    const response = applyResponseCachePolicy(
      new Request("https://post.pistonmaster.net/", { headers: { Cookie: "session=opaque" } }),
      new Response("feed"),
    )

    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL)
  })

  it("keeps mutations and responses that set cookies private", () => {
    const mutation = applyResponseCachePolicy(
      new Request("https://post.pistonmaster.net/post/example", { method: "POST" }),
      new Response(null, { status: 204 }),
    )
    const cookieResponse = applyResponseCachePolicy(
      new Request("https://post.pistonmaster.net/post/example"),
      new Response("post", { headers: { "Set-Cookie": "session=opaque" } }),
    )

    expect(mutation.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL)
    expect(cookieResponse.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL)
  })

  it("preserves an explicit no-store policy for unlisted content", () => {
    const response = applyResponseCachePolicy(
      new Request("https://post.pistonmaster.net/post/unlisted"),
      new Response("unlisted", { headers: { "Cache-Control": "private, no-store" } }),
    )

    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })
})
