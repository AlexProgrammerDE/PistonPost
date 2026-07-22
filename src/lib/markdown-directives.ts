import type { Paragraph, Root, Text } from "mdast"
import type {
  ContainerDirective,
  Directives,
  LeafDirective,
  TextDirective,
} from "mdast-util-directive"
import { toString } from "mdast-util-to-string"
import { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize"
import { CONTINUE, SKIP, visit } from "unist-util-visit"

import { parseMarkdownEmbed, type MarkdownEmbed } from "./markdown-embeds"
import { safeExternalUserGeneratedUrl } from "./user-generated-link"

const MAX_DIRECTIVE_LABEL_LENGTH = 200
const MAX_SPOILER_LENGTH = 1_000
const CALLOUT_KINDS = ["note", "tip", "warning"] as const

export type MarkdownCalloutKind = (typeof CALLOUT_KINDS)[number]

type ParsedPostLeafDirective =
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

export type ParsedPostInlineDirective = {
  readonly kind: "spoiler"
  readonly label: string
}

export type ParsedPostContainerDirective =
  | {
      readonly kind: "details"
      readonly label: string
    }
  | {
      readonly calloutKind: MarkdownCalloutKind
      readonly kind: "callout"
      readonly label: string | null
    }

export const postMarkdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["dataPostDirective", "details", "callout"],
      "dataLabel",
      ["dataKind", ...CALLOUT_KINDS],
    ],
    p: [
      ...(defaultSchema.attributes?.p ?? []),
      ["dataPostDirective", "embed", "card"],
      "dataUrl",
      "dataLabel",
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["dataPostDirective", "spoiler"],
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

function parsePostLeafDirectiveInput(
  kind: string,
  url: string,
  label: string | null,
): ParsedPostLeafDirective | null {
  if (label && label.length > MAX_DIRECTIVE_LABEL_LENGTH) return null
  const safeUrl = safeExternalHttpUrl(url)
  if (!safeUrl) return null

  if (kind === "embed") {
    const embed = parseMarkdownEmbed(safeUrl)
    return embed ? { embed, kind, label, url: safeUrl } : null
  }
  return kind === "card" ? { kind, label, url: safeUrl } : null
}

function hasNoAttributes(directive: Directives) {
  return !directive.attributes || Object.keys(directive.attributes).length === 0
}

function parsePostLeafDirective(directive: Directives) {
  if (directive.type !== "leafDirective") return null
  const attributes = directive.attributes
  if (!attributes || Object.keys(attributes).length !== 1 || typeof attributes.url !== "string") {
    return null
  }

  const label = normalizeDirectiveLabel(toString(directive)) || null
  return parsePostLeafDirectiveInput(directive.name, attributes.url, label)
}

function parsePostInlineDirective(directive: Directives): ParsedPostInlineDirective | null {
  if (directive.type !== "textDirective" || directive.name !== "spoiler") return null
  const label = normalizeDirectiveLabel(toString(directive))
  if (!hasNoAttributes(directive) || !label || label.length > MAX_SPOILER_LENGTH) return null
  return { kind: "spoiler", label }
}

function directiveContainerLabel(directive: ContainerDirective) {
  const firstChild = directive.children[0]
  if (firstChild?.type !== "paragraph" || firstChild.data?.directiveLabel !== true) return null
  return normalizeDirectiveLabel(toString(firstChild)) || null
}

function parsePostContainerDirective(directive: Directives): ParsedPostContainerDirective | null {
  if (directive.type !== "containerDirective") return null
  const label = directiveContainerLabel(directive)
  const bodyStart = label ? 1 : 0
  if (directive.children.length <= bodyStart) return null

  if (directive.name === "details") {
    if (!hasNoAttributes(directive) || !label || label.length > MAX_DIRECTIVE_LABEL_LENGTH) {
      return null
    }
    return { kind: "details", label }
  }
  if (directive.name !== "callout") return null

  const attributes = directive.attributes ?? {}
  const keys = Object.keys(attributes)
  if (keys.some((key) => key !== "kind") || keys.length > 1) return null
  const requestedKind = attributes.kind ?? "note"
  const calloutKind = CALLOUT_KINDS.find((candidate) => candidate === requestedKind)
  if (!calloutKind || (label && label.length > MAX_DIRECTIVE_LABEL_LENGTH)) return null
  return { kind: "callout", calloutKind, label }
}

function directiveParagraph(directive: LeafDirective, parsed: ParsedPostLeafDirective): Paragraph {
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

function directiveSpan(directive: TextDirective, parsed: ParsedPostInlineDirective): TextDirective {
  return {
    ...directive,
    children: [{ type: "text", value: "Spoiler" }],
    data: {
      hName: "span",
      hProperties: {
        dataPostDirective: parsed.kind,
        dataLabel: parsed.label,
      },
    },
  }
}

function directiveContainer(directive: ContainerDirective, parsed: ParsedPostContainerDirective) {
  const hasLabel = directiveContainerLabel(directive) !== null
  directive.children = hasLabel ? directive.children.slice(1) : directive.children
  directive.data = {
    hName: "div",
    hProperties: {
      dataPostDirective: parsed.kind,
      ...(parsed.label ? { dataLabel: parsed.label } : {}),
      ...(parsed.kind === "callout" ? { dataKind: parsed.calloutKind } : {}),
    },
  }
}

export function parseRenderedPostDirective(
  properties: Readonly<Record<string, unknown>>,
): ParsedPostLeafDirective | null {
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
  return parsePostLeafDirectiveInput(properties.dataPostDirective, properties.dataUrl, label)
}

export function parseRenderedPostInlineDirective(
  properties: Readonly<Record<string, unknown>>,
): ParsedPostInlineDirective | null {
  if (properties.dataPostDirective !== "spoiler" || typeof properties.dataLabel !== "string") {
    return null
  }
  const label = normalizeDirectiveLabel(properties.dataLabel)
  return label && label.length <= MAX_SPOILER_LENGTH ? { kind: "spoiler", label } : null
}

export function parseRenderedPostContainerDirective(
  properties: Readonly<Record<string, unknown>>,
): ParsedPostContainerDirective | null {
  const label =
    typeof properties.dataLabel === "string"
      ? normalizeDirectiveLabel(properties.dataLabel) || null
      : null
  if (properties.dataPostDirective === "details") {
    return label && label.length <= MAX_DIRECTIVE_LABEL_LENGTH ? { kind: "details", label } : null
  }
  if (properties.dataPostDirective !== "callout" || typeof properties.dataKind !== "string") {
    return null
  }
  const calloutKind = CALLOUT_KINDS.find((candidate) => candidate === properties.dataKind)
  if (!calloutKind || (label && label.length > MAX_DIRECTIVE_LABEL_LENGTH)) return null
  return { kind: "callout", calloutKind, label }
}

export function postDirectiveForUrl(value: string) {
  const embed = parsePostLeafDirectiveInput("embed", value, null)
  const directive = embed ?? parsePostLeafDirectiveInput("card", value, null)
  return directive ? `::${directive.kind}{url="${directive.url}"}` : null
}

export function remarkPostDirectives() {
  return (tree: Root, file: { readonly value: unknown }) => {
    const source = typeof file.value === "string" ? file.value : ""

    visit(tree, (node, index, parent) => {
      if (!isDirective(node)) return CONTINUE
      if (index === undefined || !parent) return CONTINUE

      const leaf = parsePostLeafDirective(node)
      if (leaf && node.type === "leafDirective") {
        parent.children[index] = directiveParagraph(node, leaf)
        return SKIP
      }

      const inline = parsePostInlineDirective(node)
      if (inline && node.type === "textDirective") {
        parent.children[index] = directiveSpan(node, inline)
        return SKIP
      }

      const container = parsePostContainerDirective(node)
      if (container && node.type === "containerDirective") {
        directiveContainer(node, container)
        return CONTINUE
      }

      parent.children[index] = directiveFallback(node, source)
      return SKIP
    })
  }
}
