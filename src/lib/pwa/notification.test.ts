import { describe, expect, it } from "bun:test"

import { safeNotificationPayload } from "./notification"

describe("notification navigation", () => {
  const origin = "https://example.com"
  it("preserves same-origin paths and rejects external or executable destinations", () => {
    const path = `/post/${crypto.randomUUID()}?image=2#comments`
    expect(safeNotificationPayload({ url: path }, origin).url).toBe(path)
    expect(safeNotificationPayload({ url: origin + path }, origin).url).toBe(path)
    for (const url of [
      "https://other.example/",
      "//other.example/",
      "javascript:alert(1)",
      "https://[",
    ]) {
      expect(safeNotificationPayload({ url }, origin).url).toBe("/")
    }
  })
  it("handles malformed and missing push payloads without losing a visible notification", () => {
    const fallback = safeNotificationPayload(null, origin)
    expect(safeNotificationPayload({ title: 4, body: [], url: {} }, origin)).toEqual(fallback)
    expect(safeNotificationPayload("invalid", origin)).toEqual(fallback)
  })
})
