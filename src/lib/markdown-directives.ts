import type { Paragraph, Root, Text } from "mdast"
import type { Directives } from "mdast-util-directive"
import { CONTINUE, SKIP, visit } from "unist-util-visit"

type PostDirectiveHandler = (directive: Directives) => void

const postDirectiveHandlers: ReadonlyMap<string, PostDirectiveHandler> = new Map()

function isDirective(node: { readonly type: string }): node is Directives {
  return (
    node.type === "containerDirective" ||
    node.type === "leafDirective" ||
    node.type === "textDirective"
  )
}

function directiveSource(directive: Directives, source: string) {
  const start = directive.position?.start.offset
  const end = directive.position?.end.offset
  if (
    typeof start === "number" &&
    typeof end === "number" &&
    start >= 0 &&
    end >= start &&
    end <= source.length
  ) {
    return source.slice(start, end)
  }

  const marker =
    directive.type === "containerDirective"
      ? ":::"
      : directive.type === "leafDirective"
        ? "::"
        : ":"
  return `${marker}${directive.name}`
}

function directiveFallback(directive: Directives, source: string): Paragraph | Text {
  const text: Text = {
    type: "text",
    value: directiveSource(directive, source),
  }

  return directive.type === "textDirective"
    ? text
    : {
        type: "paragraph",
        children: [text],
      }
}

export function remarkPostDirectives() {
  return (tree: Root, file: { readonly value: unknown }) => {
    const source = typeof file.value === "string" ? file.value : ""

    visit(tree, (node, index, parent) => {
      if (!isDirective(node)) return CONTINUE
      if (index === undefined || !parent) return CONTINUE

      const handler = postDirectiveHandlers.get(node.name)
      if (handler) {
        handler(node)
        return CONTINUE
      }

      parent.children[index] = directiveFallback(node, source)
      return SKIP
    })
  }
}
