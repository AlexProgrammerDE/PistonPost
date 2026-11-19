import { describe, expect, test } from "bun:test"

import { renderToStaticMarkup } from "react-dom/server"

import { MarkdownContent } from "./MarkdownContent"

describe("MarkdownContent", () => {
  test("names a hidden spoiler by its action without overriding its revealed text", () => {
    const html = renderToStaticMarkup(<MarkdownContent>:spoiler[the ending]</MarkdownContent>)

    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('<span class="sr-only">Reveal spoiler</span>')
    expect(html).not.toContain("aria-label")
  })

  test("does not promise proxying for external images on saved posts", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent postId="saved-post">![cat](http://example.com/cat.png)</MarkdownContent>,
    )

    expect(html).not.toContain("will be proxied")
    expect(html).toContain("Opens an image on example.com.")
  })
  test("renders external image cards inside paragraphs with inline elements only", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent postId="saved-post">
        Look ![cat](http://example.com/cat.png) here
      </MarkdownContent>,
    )
    const paragraph = /<p>(.*)<\/p>/su.exec(html)?.[1] ?? ""

    expect(paragraph).toContain("Opens an image on example.com.")
    expect(paragraph).not.toMatch(/<(div|p)[\s>]/u)
  })

  test("does not nest links when an external image sits inside a link", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent postId="saved-post">
        [![cat](http://example.com/cat.png)](https://example.org/page)
      </MarkdownContent>,
    )

    expect(html.match(/<a[\s>]/gu)).toHaveLength(1)
    expect(html).toContain("cat")
    const link = /<a[\s>][^]*<\/a>/u.exec(html)?.[0] ?? ""
    expect(link).not.toMatch(/<(div|p)[\s>]/u)
  })

  test("does not nest a link inside a link for comment images", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent variant="comment">
        [![cat](https://example.com/cat.png)](https://example.org/page)
      </MarkdownContent>,
    )

    expect(html.match(/<a[\s>]/gu)).toHaveLength(1)
    expect(html).toContain("Image: cat")
  })

  test("keeps a spoiler inside a link covered without nesting a button", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>[see :spoiler[the ending]](https://example.org)</MarkdownContent>,
    )

    expect(html).not.toContain("<button")
    expect(html).not.toContain("the ending")
    expect(html).toContain("Hidden spoiler")
  })

  test("links footnote references to their targets", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>{"Claim[^1]\n\n[^1]: Source"}</MarkdownContent>,
    )
    const reference = /<a[^>]*data-footnote-ref[^>]*>/u.exec(html)?.[0] ?? ""
    const href = /href="#([^"]+)"/u.exec(reference)?.[1]

    expect(href).toBeDefined()
    expect(html).toContain(`id="${href}"`)
  })

  test("scopes footnote IDs to each rendered document", () => {
    const html = renderToStaticMarkup(
      <>
        <MarkdownContent>{"One[^1]\n\n[^1]: First"}</MarkdownContent>
        <MarkdownContent variant="comment">{"Two[^1]\n\n[^1]: Second"}</MarkdownContent>
      </>,
    )
    const ids = [...html.matchAll(/id="([^"]+)"/gu)].map((match) => match[1])

    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("wraps post tables so wide tables can scroll", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>{"| a | b |\n| - | - |\n| 1 | 2 |"}</MarkdownContent>,
    )

    expect(html).toContain('<div class="typeset-scroll"><table>')
  })

  test("renders cards and embeds inside tight list items", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          '- ::card[Example]{url="https://example.com"}\n- ::embed{url="https://youtu.be/M7lc1UVf-VE"}'
        }
      </MarkdownContent>,
    )

    expect(html).toContain("/external?url=https%3A%2F%2Fexample.com%2F")
    expect(html).toContain("Load this embed to share data with YouTube.")
    expect(html).not.toContain("::card")
  })
})
