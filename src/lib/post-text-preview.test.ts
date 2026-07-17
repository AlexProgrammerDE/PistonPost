import { describe, expect, test } from "bun:test"

import { createPostTextPreview, POST_TEXT_PREVIEW_GRAPHEME_LIMIT } from "./post-text-preview"

describe("post text previews", () => {
  test("turns short Markdown into readable plain text", () => {
    expect(
      createPostTextPreview(
        "## Release notes\n\n- **Safer feeds**\n- [Full details](https://example.com)",
      ),
    ).toEqual({
      text: "Release notes Safer feeds Full details",
      truncated: false,
    })
  })

  test("caps unusually wide Arabic presentation characters", () => {
    const wideArabicLigature = "﷽"
    const preview = createPostTextPreview(
      wideArabicLigature.repeat(POST_TEXT_PREVIEW_GRAPHEME_LIMIT + 1),
    )

    expect(preview).toEqual({
      text: `${wideArabicLigature.repeat(POST_TEXT_PREVIEW_GRAPHEME_LIMIT)}…`,
      truncated: true,
    })
  })

  test("does not split multi-code-point graphemes", () => {
    const familyEmoji = "👨‍👩‍👧‍👦"
    const preview = createPostTextPreview(familyEmoji.repeat(POST_TEXT_PREVIEW_GRAPHEME_LIMIT + 1))

    expect(preview.text).toBe(`${familyEmoji.repeat(POST_TEXT_PREVIEW_GRAPHEME_LIMIT)}…`)
    expect(preview.truncated).toBe(true)
  })
})
