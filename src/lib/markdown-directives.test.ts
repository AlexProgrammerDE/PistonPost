import { describe, expect, test } from "bun:test"

import rehypeSanitize from "rehype-sanitize"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"

import {
  parseRenderedPostDirective,
  postDirectiveForUrl,
  postMarkdownSanitizeSchema,
  remarkPostDirectives,
} from "./markdown-directives"

function parsePostMarkdown(source: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkPostDirectives)

  return processor.runSync(processor.parse(source), source)
}

function renderPostMarkdown(source: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkPostDirectives)
    .use(remarkRehype)
    .use(rehypeSanitize, postMarkdownSanitizeSchema)

  return processor.runSync(processor.parse(source), source)
}

describe("post Markdown directives", () => {
  test("renders allowlisted embeds and cards as sanitized directive paragraphs", () => {
    expect(
      renderPostMarkdown(
        '::embed[Demo video]{url="https://youtu.be/M7lc1UVf-VE"}\n\n::card{url="https://example.com"}',
      ),
    ).toMatchObject({
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {
            dataPostDirective: "embed",
            dataUrl: "https://youtu.be/M7lc1UVf-VE",
            dataLabel: "Demo video",
          },
          children: [{ type: "text", value: "Demo video" }],
        },
        { type: "text", value: "\n" },
        {
          type: "element",
          tagName: "p",
          properties: {
            dataPostDirective: "card",
            dataUrl: "https://example.com/",
          },
          children: [{ type: "text", value: "https://example.com/" }],
        },
      ],
    })
  })

  test("keeps standalone links as ordinary links", () => {
    expect(renderPostMarkdown("https://youtu.be/M7lc1UVf-VE")).toMatchObject({
      children: [
        {
          tagName: "p",
          properties: {},
          children: [
            {
              tagName: "a",
              properties: { href: "https://youtu.be/M7lc1UVf-VE" },
            },
          ],
        },
      ],
    })
  })

  test("creates explicit directives only for supported pasted URLs", () => {
    expect(postDirectiveForUrl("https://youtu.be/M7lc1UVf-VE?t=30")).toBe(
      '::embed{url="https://youtu.be/M7lc1UVf-VE?t=30"}',
    )
    expect(postDirectiveForUrl("https://example.com")).toBe('::card{url="https://example.com/"}')
    expect(postDirectiveForUrl("/post/one")).toBeNull()
  })

  test("rejects invalid rendered properties at the component boundary", () => {
    expect(
      parseRenderedPostDirective({
        dataPostDirective: "embed",
        dataUrl: "javascript:alert(1)",
      }),
    ).toBeNull()
    expect(
      parseRenderedPostDirective({
        dataPostDirective: "embed",
        dataUrl: "https://example.com/video",
      }),
    ).toBeNull()
    expect(
      parseRenderedPostDirective({
        dataPostDirective: "card",
        dataUrl: "https://example.com",
      }),
    ).toMatchObject({ kind: "card", url: "https://example.com/" })
  })

  test("preserves unsupported inline directives as source text", () => {
    expect(parsePostMarkdown("Before :future[text]{value=one} after")).toMatchObject({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Before " },
            { type: "text", value: ":future[text]{value=one}" },
            { type: "text", value: " after" },
          ],
        },
      ],
    })
  })

  test("preserves unsupported leaf directives as source text", () => {
    expect(parsePostMarkdown("::toString[Label]{value=one}")).toMatchObject({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "::toString[Label]{value=one}" }],
        },
      ],
    })
  })

  test("preserves complete unsupported containers without interpreting their contents", () => {
    const source = ":::future[Label]\n**Markdown** and :nested[text]\n:::"

    expect(parsePostMarkdown(source)).toMatchObject({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: source }],
        },
      ],
    })
  })

  test("preserves invalid allowlisted directives as source text", () => {
    expect(
      parsePostMarkdown(
        '::embed{url="https://example.com/video"}\n\n::card{url="https://example.com" extra="no"}',
      ),
    ).toMatchObject({
      children: [
        {
          type: "paragraph",
          children: [{ value: '::embed{url="https://example.com/video"}' }],
        },
        {
          type: "paragraph",
          children: [{ value: '::card{url="https://example.com" extra="no"}' }],
        },
      ],
    })
  })
})
