import { describe, expect, test } from "bun:test"

import { applySecurityHeaders, validateRequestSecurity } from "./request-security"

const origin = "https://pistonpost.example"

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

  test("sets CSP and browser hardening headers", () => {
    const request = new Request(origin)
    const response = applySecurityHeaders(request, new Response("ok"), true)

    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
    expect(response.headers.get("Strict-Transport-Security")).toContain("includeSubDomains")
  })
})
