import { describe, expect, test } from "bun:test"

import { renderToStaticMarkup } from "react-dom/server"

import { MarkdownContent } from "./MarkdownContent"

describe("MarkdownContent", () => {
  test("names a hidden spoiler by its action without overriding its revealed text", () => {
    const html = renderToStaticMarkup(<MarkdownContent>{":spoiler[the ending]"}</MarkdownContent>)

    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('<span class="sr-only">Reveal spoiler</span>')
    expect(html).not.toContain("aria-label")
  })

  test("does not promise proxying for external images on saved posts", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent postId="saved-post">{"![cat](http://example.com/cat.png)"}</MarkdownContent>,
    )

    expect(html).not.toContain("will be proxied")
    expect(html).toContain("Opens an image on example.com.")
  })
})
