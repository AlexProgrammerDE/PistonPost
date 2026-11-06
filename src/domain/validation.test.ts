import { describe, expect, test } from "bun:test"

import { Result, Schema } from "effect"

import { MAX_POST_MARKDOWN_LENGTH, postDraftInputSchema, postMarkdownSchema } from "./validation"

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
