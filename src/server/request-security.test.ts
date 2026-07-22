import { describe, expect, test } from "bun:test"

import { applySecurityHeaders, validateRequestSecurity } from "./request-security"

const origin = "https://post.pistonmaster.net"

function mutation(path: string, headers: HeadersInit = {}) {
  const requestHeaders = new Headers(headers)
  if (!requestHeaders.has("content-length")) requestHeaders.set("content-length", "2")
  if (!requestHeaders.has("content-type")) requestHeaders.set("content-type", "application/json")
  if (!requestHeaders.has("origin")) requestHeaders.set("origin", origin)
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: requestHeaders,
    body: "{}",
  })
}

describe("request security", () => {
  test("accepts same-origin JSON mutations", () => {
    expect(validateRequestSecurity(mutation("/_serverFn/create"), origin)).toBeNull()
  })

  test("accepts GIF image uploads while rejecting non-raster upload types", () => {
    expect(
      validateRequestSecurity(
        mutation("/media/upload/asset-id", { "content-type": "image/gif" }),
        origin,
      ),
    ).toBeNull()
    expect(
      validateRequestSecurity(
        mutation("/media/upload/asset-id", { "content-type": "image/svg+xml" }),
        origin,
      )?.status,
    ).toBe(415)
  })

  test("rejects missing origins, unsupported media, and oversized bodies", async () => {
    const missingOrigin = mutation("/_serverFn/create")
    missingOrigin.headers.delete("origin")
    expect(validateRequestSecurity(missingOrigin, origin)?.status).toBe(403)

    expect(
      validateRequestSecurity(
        mutation("/_serverFn/create", { "content-type": "text/plain" }),
        origin,
      )?.status,
    ).toBe(415)

    const oversized = mutation("/_serverFn/create", { "content-length": "1048577" })
    const response = validateRequestSecurity(oversized, origin)
    expect(response?.status).toBe(413)
    expect(await response?.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } })
  })

  test("allows verified webhook delivery without a browser origin", () => {
    const request = mutation("/api/stream/webhook")
    request.headers.delete("origin")
    expect(validateRequestSecurity(request, origin)).toBeNull()
  })

  test("allows RFC 8058 one-click posts without weakening other mutation origins", () => {
    const oneClick = mutation("/email/unsubscribe?token=signed", {
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "cross-site",
    })
    oneClick.headers.delete("origin")
    expect(validateRequestSecurity(oneClick, origin)).toBeNull()

    const otherMutation = mutation("/_serverFn/create", { "sec-fetch-site": "cross-site" })
    expect(validateRequestSecurity(otherMutation, origin)?.status).toBe(403)
  })

  test("limits one-click unsubscribe bodies and accepts only form media types", () => {
    const wrongType = mutation("/email/unsubscribe?token=signed")
    wrongType.headers.delete("origin")
    expect(validateRequestSecurity(wrongType, origin)?.status).toBe(415)

    const oversized = mutation("/email/unsubscribe?token=signed", {
      "content-length": "8193",
      "content-type": "application/x-www-form-urlencoded",
    })
    oversized.headers.delete("origin")
    expect(validateRequestSecurity(oversized, origin)?.status).toBe(413)
  })

  test("sets CSP and browser hardening headers", () => {
    const request = new Request(origin)
    const response = applySecurityHeaders(request, new Response("ok"), true)
    const policy = response.headers.get("Content-Security-Policy")

    expect(policy).toContain("frame-ancestors 'none'")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
    expect(response.headers.get("Strict-Transport-Security")).toContain("includeSubDomains")
  })

  test("allows browser resources required by configured third-party services", () => {
    const response = applySecurityHeaders(new Request(origin), new Response("ok"), true)
    const policy = response.headers.get("Content-Security-Policy")

    expect(policy?.split("; ").find((directive) => directive.startsWith("connect-src "))).toBe(
      "connect-src 'self' https://challenges.cloudflare.com https://kv.better-auth.com https://*.videodelivery.net https://*.cloudflarestream.com https://t.pistonmaster.net https://*.posthog.com",
    )
    expect(policy?.split("; ").find((directive) => directive.startsWith("frame-src "))).toBe(
      "frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://open.spotify.com https://w.soundcloud.com https://player.vimeo.com https://geo.dailymotion.com https://platform.x.com https://platform.twitter.com https://embed.tumblr.com",
    )
    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://www.gstatic.com https://platform.x.com https://assets.tumblr.com https://t.pistonmaster.net https://*.posthog.com",
    )
    expect(policy).toContain(
      "media-src 'self' blob: https://*.videodelivery.net https://*.cloudflarestream.com https://*.posthog.com",
    )
    expect(policy).toContain("font-src 'self' data: https://*.posthog.com")
    expect(policy?.split("; ").find((directive) => directive.startsWith("img-src "))).toBe(
      "img-src 'self' data: blob: https://*.videodelivery.net https://*.cloudflarestream.com https://*.posthog.com",
    )
    expect(policy).toContain("style-src 'self' 'unsafe-inline' https://*.posthog.com")
  })
})
