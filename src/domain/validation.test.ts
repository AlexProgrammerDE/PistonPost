import { describe, expect, test } from "bun:test"

import { Result, Schema } from "effect"

import {
  isValidUsername,
  MAX_POST_MARKDOWN_LENGTH,
  postDraftInputSchema,
  postMarkdownSchema,
  profileWebsiteSchema,
  tagSchema,
  usernameSchema,
} from "./validation"

const common = { title: "look at this", tags: ["art"], visibility: "public" as const }

describe("post draft input", () => {
  test("accepts text, image, and video drafts", () => {
    expect(
      Result.isSuccess(
        Schema.decodeResult(postDraftInputSchema, { errors: "all" })({
          ...common,
          type: "text",
          textContent: "Cut, weld, repeat.",
        }),
      ),
    ).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(postDraftInputSchema, { errors: "all" })({
          ...common,
          type: "images",
          mediaIds: [],
        }),
      ),
    ).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(postDraftInputSchema, { errors: "all" })({
          ...common,
          type: "video",
          mediaId: null,
        }),
      ),
    ).toBe(true)
  })

  test("rejects unsafe tag syntax and dishonest visibility values", () => {
    expect(
      Result.isSuccess(
        Schema.decodeResult(postDraftInputSchema, { errors: "all" })({
          ...common,
          type: "text",
          textContent: "hello",
          tags: ["not a tag"],
        }),
      ),
    ).toBe(false)
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(postDraftInputSchema, { errors: "all" })({
          ...common,
          type: "text",
          textContent: "hello",
          visibility: "private",
        }),
      ),
    ).toBe(false)
  })

  test("accepts up to 150 images", () => {
    const mediaIds = Array.from({ length: 151 }, (_, index) => `media-${index.toString()}`)

    expect(
      Result.isSuccess(
        Schema.decodeResult(postDraftInputSchema, { errors: "all" })({
          ...common,
          type: "images",
          mediaIds: mediaIds.slice(0, 150),
        }),
      ),
    ).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(postDraftInputSchema, { errors: "all" })({
          ...common,
          type: "images",
          mediaIds,
        }),
      ),
    ).toBe(false)
  })

  test("enforces the shared Markdown length boundary", () => {
    expect(
      Result.isSuccess(
        Schema.decodeResult(postMarkdownSchema, { errors: "all" })(
          "x".repeat(MAX_POST_MARKDOWN_LENGTH),
        ),
      ),
    ).toBe(true)
    expect(
      Result.isSuccess(
        Schema.decodeResult(postMarkdownSchema, { errors: "all" })(
          "x".repeat(MAX_POST_MARKDOWN_LENGTH + 1),
        ),
      ),
    ).toBe(false)
  })
})

function accepts(schema: typeof usernameSchema, value: string) {
  return Result.isSuccess(Schema.decodeResult(schema)(value))
}

describe("usernames and tags", () => {
  test("rejects names made only of dots because they break profile and tag URLs", () => {
    for (const value of [".", "..", "..."]) {
      expect(accepts(usernameSchema, value)).toBe(false)
      expect(accepts(tagSchema, value)).toBe(false)
      expect(isValidUsername(value)).toBe(false)
    }
  })

  test("still accepts dots next to other characters", () => {
    for (const value of ["a.b", ".hidden", "trailing.", "~.~"]) {
      expect(accepts(usernameSchema, value)).toBe(true)
      expect(accepts(tagSchema, value)).toBe(true)
      expect(isValidUsername(value)).toBe(true)
    }
  })

  test("matches the username schema length and character rules", () => {
    expect(isValidUsername("a".repeat(32))).toBe(true)
    expect(isValidUsername("a".repeat(33))).toBe(false)
    expect(isValidUsername("")).toBe(false)
    expect(isValidUsername("has space")).toBe(false)
    expect(accepts(usernameSchema, "a".repeat(33))).toBe(false)
  })
})

describe("profile website", () => {
  const decode = Schema.decodeResult(profileWebsiteSchema)

  test("accepts http and https links and an empty value", () => {
    expect(Result.isSuccess(decode(""))).toBe(true)
    expect(Result.isSuccess(decode("https://example.com/me"))).toBe(true)
    expect(Result.isSuccess(decode("http://example.com"))).toBe(true)
  })

  test("rejects other URL schemes with a plain message", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "nope"]) {
      const result = decode(value)
      expect(Result.isFailure(result)).toBe(true)
    }
    const result = decode("javascript:alert(1)")
    if (!Result.isFailure(result)) throw new Error("Expected the scheme to be rejected.")
    expect(String(result.failure)).toContain("Use an http or https link")
  })
})
