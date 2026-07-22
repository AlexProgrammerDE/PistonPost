import { describe, expect, test } from "bun:test"

import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"

import { remarkPostDirectives } from "./markdown-directives"

function parsePostMarkdown(source: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkPostDirectives)

  return processor.runSync(processor.parse(source), source)
}

describe("post Markdown directives", () => {
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
})
