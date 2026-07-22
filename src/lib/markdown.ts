import type { Definition, Image, ImageReference } from "mdast"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"

import { remarkPostDirectives } from "./markdown-directives"

const BLOCKED_IMAGE_HOSTNAMES = ["home.arpa", "internal", "local", "localhost"]
const IPV4_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$/u
const BLOCK_TEXT_NODES = new Set([
  "root",
  "blockquote",
  "list",
  "listItem",
  "containerDirective",
  "table",
  "tableRow",
  "tableCell",
])

type MarkdownTextNode = {
  readonly alt?: unknown
  readonly children?: ReadonlyArray<MarkdownTextNode>
  readonly data?: {
    readonly hProperties?: {
      readonly dataLabel?: unknown
      readonly dataPostDirective?: unknown
    }
  }
  readonly type: string
  readonly value?: unknown
}

const gfmMarkdownProcessor = unified().use(remarkParse).use(remarkGfm).freeze()
const postMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkPostDirectives)
  .freeze()

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

export function isProxyableExternalImageUrl(value: string) {
  const url = parseHttpUrl(value)
  if (!url || url.protocol !== "https:" || url.username || url.password) return false
  if (url.port && url.port !== "443") return false

  const hostname = url.hostname.toLocaleLowerCase("en-US").replace(/\.$/u, "")
  if (!hostname || IPV4_HOST.test(hostname) || hostname.includes(":")) {
    return false
  }
  return !BLOCKED_IMAGE_HOSTNAMES.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  )
}

export const EXTERNAL_IMAGE_CACHE_VERSION = 1

export function externalImageProxyUrl(postId: string, sourceUrl: string) {
  const search = new URLSearchParams({
    v: EXTERNAL_IMAGE_CACHE_VERSION.toString(),
    source: sourceUrl,
  })
  return `/media/external-image/${encodeURIComponent(postId)}?${search.toString()}`
}

export function markdownContainsImageUrl(markdown: string, sourceUrl: string) {
  const tree = gfmMarkdownProcessor.parse(markdown)
  const definitions = new Map<string, string>()
  const imageUrls: string[] = []
  const imageReferences: string[] = []

  visit(tree, (node) => {
    if (isDefinition(node)) {
      if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url)
    } else if (isImage(node)) {
      imageUrls.push(node.url)
    } else if (isImageReference(node)) {
      imageReferences.push(node.identifier)
    }
  })

  return (
    imageUrls.includes(sourceUrl) ||
    imageReferences.some((identifier) => definitions.get(identifier) === sourceUrl)
  )
}

export function postMarkdownToPlainText(markdown: string) {
  const tree = postMarkdownProcessor.runSync(postMarkdownProcessor.parse(markdown), markdown)
  return markdownNodeToPlainText(tree).replaceAll(/\s+/gu, " ").trim()
}

export function commentMarkdownToPlainText(markdown: string) {
  const tree = gfmMarkdownProcessor.runSync(gfmMarkdownProcessor.parse(markdown), markdown)
  return markdownNodeToPlainText(tree).replaceAll(/\s+/gu, " ").trim()
}

function markdownNodeToPlainText(node: MarkdownTextNode): string {
  if (node.type === "html") return ""
  if (node.type === "image" || node.type === "imageReference") {
    return typeof node.alt === "string" ? node.alt : ""
  }
  if (
    (node.type === "text" || node.type === "inlineCode" || node.type === "code") &&
    typeof node.value === "string"
  ) {
    return node.value
  }
  if (node.type === "break") return " "
  if (!node.children) return ""

  const childText = node.children
    .map((child) => markdownNodeToPlainText(child))
    .join(BLOCK_TEXT_NODES.has(node.type) ? " " : "")
  const directiveLabel =
    node.type === "containerDirective" &&
    (node.data?.hProperties?.dataPostDirective === "details" ||
      node.data?.hProperties?.dataPostDirective === "callout") &&
    typeof node.data.hProperties.dataLabel === "string"
      ? node.data.hProperties.dataLabel
      : ""
  return directiveLabel ? `${directiveLabel} ${childText}` : childText
}

function isDefinition(node: { readonly type: string }): node is Definition {
  return node.type === "definition"
}

function isImage(node: { readonly type: string }): node is Image {
  return node.type === "image"
}

function isImageReference(node: { readonly type: string }): node is ImageReference {
  return node.type === "imageReference"
}
