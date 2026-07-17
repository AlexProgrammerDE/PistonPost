import { describe, expect, test } from "bun:test"

import {
  MAX_USER_GENERATED_URL_LENGTH,
  externalLinkWarningPath,
  isExternalUserGeneratedUrl,
  safeExternalUserGeneratedUrl,
  safeUserGeneratedUrl,
  userGeneratedLinkRel,
} from "./user-generated-link"

describe("user-generated link policy", () => {
  test("keeps safe destinations and drops executable or oversized URLs", () => {
    expect(safeUserGeneratedUrl("/post/example")).toBe("/post/example")
    expect(safeUserGeneratedUrl("https://example.com/page")).toBe("https://example.com/page")
    expect(safeUserGeneratedUrl("mailto:hello@example.com")).toBe("mailto:hello@example.com")
    expect(safeUserGeneratedUrl("javascript:alert(1)")).toBe("")
    expect(safeUserGeneratedUrl("data:text/html,unsafe")).toBe("")
    expect(
      safeUserGeneratedUrl(`https://example.com/${"x".repeat(MAX_USER_GENERATED_URL_LENGTH)}`),
    ).toBe("")
  })

  test("classifies and normalizes only external destinations", () => {
    expect(isExternalUserGeneratedUrl("/post/example")).toBe(false)
    expect(isExternalUserGeneratedUrl("https://post.pistonmaster.net/post/example")).toBe(false)
    expect(isExternalUserGeneratedUrl("https://example.com/page")).toBe(true)
    expect(isExternalUserGeneratedUrl("mailto:hello@example.com")).toBe(true)

    expect(safeExternalUserGeneratedUrl("/post/example")).toBeNull()
    expect(safeExternalUserGeneratedUrl("https://example.com")).toBe("https://example.com/")
  })

  test("uses the warning route and complete relationship policy", () => {
    expect(externalLinkWarningPath("https://example.com/")).toBe(
      "/external?url=https%3A%2F%2Fexample.com%2F",
    )
    expect(userGeneratedLinkRel(false)).toBe("ugc")
    expect(userGeneratedLinkRel(true)).toBe("ugc nofollow noopener noreferrer")
    expect(userGeneratedLinkRel(true, "me")).toBe("ugc nofollow noopener noreferrer me")
  })
})
