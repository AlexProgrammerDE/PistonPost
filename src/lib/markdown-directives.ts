import type { Paragraph, Root, Text } from "mdast"
import type { Directives, LeafDirective } from "mdast-util-directive"
import { toString } from "mdast-util-to-string"
import { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize"
import { CONTINUE, SKIP, visit } from "unist-util-visit"

import { parseMarkdownEmbed, type MarkdownEmbed } from "./markdown-embeds"
import { safeExternalUserGeneratedUrl } from "./user-generated-link"

const MAX_DIRECTIVE_LABEL_LENGTH = 200

type ParsedPostDirective =
  | {
      readonly embed: MarkdownEmbed
      readonly kind: "embed"
      readonly label: string | null
      readonly url: string
    }
  | {
      readonly kind: "card"
      readonly label: string | null
      readonly url: string
    }

export const postMarkdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    p: [
      ...(defaultSchema.attributes?.p ?? []),
      ["dataPostDirective", "embed", "card"],
      "dataUrl",
      "dataLabel",
    ],
  },
}

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

function normalizeDirectiveLabel(value: string) {
  return value.replaceAll(/\s+/gu, " ").trim()
}

function safeExternalHttpUrl(value: string) {
  const safeUrl = safeExternalUserGeneratedUrl(value)
  if (!safeUrl) return null
  const protocol = new URL(safeUrl).protocol
  return protocol === "http:" || protocol === "https:" ? safeUrl : null
}

function parsePostDirectiveInput(
  kind: string,
  url: string,
  label: string | null,
): ParsedPostDirective | null {
  if (label && label.length > MAX_DIRECTIVE_LABEL_LENGTH) return null
  const safeUrl = safeExternalHttpUrl(url)
  if (!safeUrl) return null

  if (kind === "embed") {
    const embed = parseMarkdownEmbed(safeUrl)
    return embed ? { embed, kind, label, url: safeUrl } : null
  }
  return kind === "card" ? { kind, label, url: safeUrl } : null
}

function parsePostDirective(directive: Directives) {
  if (directive.type !== "leafDirective") return null
  const attributes = directive.attributes
  if (!attributes || Object.keys(attributes).length !== 1 || typeof attributes.url !== "string") {
    return null
  }

  const label = normalizeDirectiveLabel(toString(directive)) || null
  return parsePostDirectiveInput(directive.name, attributes.url, label)
}

function directiveParagraph(directive: LeafDirective, parsed: ParsedPostDirective): Paragraph {
  const fallbackText: Text = { type: "text", value: parsed.url }
  return {
    type: "paragraph",
    children: directive.children.length > 0 ? directive.children : [fallbackText],
    data: {
      hProperties: {
        dataPostDirective: parsed.kind,
        dataUrl: parsed.url,
        ...(parsed.label ? { dataLabel: parsed.label } : {}),
      },
    },
  }
}

export function parseRenderedPostDirective(
  properties: Readonly<Record<string, unknown>>,
): ParsedPostDirective | null {
  if (
    typeof properties.dataPostDirective !== "string" ||
    typeof properties.dataUrl !== "string" ||
    (properties.dataLabel !== undefined && typeof properties.dataLabel !== "string")
  ) {
    return null
  }

  const label =
    typeof properties.dataLabel === "string"
      ? normalizeDirectiveLabel(properties.dataLabel) || null
      : null
  return parsePostDirectiveInput(properties.dataPostDirective, properties.dataUrl, label)
}

export function postDirectiveForUrl(value: string) {
  const embed = parsePostDirectiveInput("embed", value, null)
  const directive = embed ?? parsePostDirectiveInput("card", value, null)
  return directive ? `::${directive.kind}{url="${directive.url}"}` : null
}

export function remarkPostDirectives() {
  return (tree: Root, file: { readonly value: unknown }) => {
    const source = typeof file.value === "string" ? file.value : ""

    visit(tree, (node, index, parent) => {
      if (!isDirective(node)) return CONTINUE
      if (index === undefined || !parent) return CONTINUE

      const directive = parsePostDirective(node)
      if (directive && node.type === "leafDirective") {
        parent.children[index] = directiveParagraph(node, directive)
        return SKIP
      }

      parent.children[index] = directiveFallback(node, source)
      return SKIP
    })
  }
}
