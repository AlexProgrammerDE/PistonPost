import { describe, expect, test } from "bun:test"

import { MAX_POST_MARKDOWN_LENGTH, postDraftInputSchema, postMarkdownSchema } from "./validation"

const common = { title: "look at this", tags: ["art"], visibility: "public" as const }

describe("post draft input", () => {
  test("accepts text, image, and video drafts", () => {
    expect(
      postDraftInputSchema.safeParse({ ...common, type: "text", textContent: "Cut, weld, repeat." })
        .success,
    ).toBe(true)
    expect(
      postDraftInputSchema.safeParse({ ...common, type: "images", mediaIds: [] }).success,
    ).toBe(true)
    expect(
      postDraftInputSchema.safeParse({ ...common, type: "video", mediaId: null }).success,
    ).toBe(true)
  })

  test("rejects unsafe tag syntax and dishonest visibility values", () => {
    expect(
      postDraftInputSchema.safeParse({
        ...common,
        type: "text",
        textContent: "hello",
        tags: ["not a tag"],
      }).success,
    ).toBe(false)
    expect(
      postDraftInputSchema.safeParse({
        ...common,
        type: "text",
        textContent: "hello",
        visibility: "private",
      }).success,
    ).toBe(false)
  })

  test("enforces the shared Markdown length boundary", () => {
    expect(postMarkdownSchema.safeParse("x".repeat(MAX_POST_MARKDOWN_LENGTH)).success).toBe(true)
    expect(postMarkdownSchema.safeParse("x".repeat(MAX_POST_MARKDOWN_LENGTH + 1)).success).toBe(
      false,
    )
  })
})
