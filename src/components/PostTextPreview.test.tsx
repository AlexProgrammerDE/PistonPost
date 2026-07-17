import { describe, expect, test } from "bun:test"

import { PostTextPreview } from "./PostTextPreview"

describe("PostTextPreview", () => {
  test("uses a direction-aware line clamp and links to the full post", () => {
    const preview = PostTextPreview({
      postId: "post-123",
      markdown: "A short post",
    })
    const [paragraph, link] = preview.props.children

    expect(paragraph.props.dir).toBe("auto")
    expect(paragraph.props.className).toContain("line-clamp-8")
    expect(link.props.to).toBe("/post/$postId")
    expect(link.props.params).toEqual({ postId: "post-123" })
    expect(link.props.children).toBe("Read full post")
  })
})
