import { describe, expect, test } from "bun:test"

import { postDraftInputSchema } from "./validation"

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
})
