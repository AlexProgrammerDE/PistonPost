import type { Definition, Image, ImageReference } from "mdast"
import { normalizeUri } from "micromark-util-sanitize-uri"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"

import { remarkPostDirectives } from "./markdown-directives"

const BLOCKED_IMAGE_HOSTNAMES = ["home.arpa", "internal", "local", "localhost"]
const IPV4_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$/u
// Containers whose children are separate blocks. Their own text comes only from those blocks.
const BLOCK_CONTAINER_NODES = new Set([
  "root",
  "blockquote",
  "list",
  "listItem",
  "containerDirective",
  "footnoteDefinition",
])
// Blocks that become one line of plain text.
const TEXT_BLOCK_NODES = new Set(["paragraph", "heading", "code", "leafDirective"])
// A block that already ends a sentence, optionally followed by closing quotes or brackets.
const SENTENCE_END = /[.!?…:;。！？]["'”’»)\]]*$/u
const TRAILING_URL = /(?:^|\s)https?:\/\/\S+$/u

type MarkdownTextNode = {
  readonly alt?: unknown
  readonly children?: readonly MarkdownTextNode[]
  readonly data?: {
    readonly hProperties?: {
      readonly dataLabel?: unknown
      readonly dataPostDirective?: unknown
    }
  }
  readonly ordered?: unknown
  readonly start?: unknown
  readonly type: string
  readonly value?: unknown
}

type PlainTextBlock = {
  readonly kind: "heading" | "text"
  /** List marker for line-based previews, such as "•" or "2.". */
  readonly marker: string | null
  readonly text: string
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
  if (url?.protocol !== "https:" || url.username || url.password) return false
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

/**
 * Checks a rendered image source against the post Markdown. Rendering normalizes
 * image URLs with `normalizeUri`, so both sides are compared in that form.
 */
export function markdownContainsImageUrl(markdown: string, sourceUrl: string) {
  const source = normalizeUri(sourceUrl)
  const tree = gfmMarkdownProcessor.parse(markdown)
  const definitions = new Map<string, string>()
  const imageUrls: string[] = []
  const imageReferences: string[] = []

  visit(tree, (node) => {
    if (isDefinition(node)) {
      if (!definitions.has(node.identifier)) {
        definitions.set(node.identifier, normalizeUri(node.url))
      }
    } else if (isImage(node)) {
      imageUrls.push(normalizeUri(node.url))
    } else if (isImageReference(node)) {
      imageReferences.push(node.identifier)
    }
  })

  return (
    imageUrls.includes(source) ||
    imageReferences.some((identifier) => definitions.get(identifier) === source)
  )
}

function postMarkdownBlocks(markdown: string) {
  const tree = postMarkdownProcessor.runSync(postMarkdownProcessor.parse(markdown), markdown)
  return markdownPlainTextBlocks(tree)
}

/**
 * Converts post Markdown to one line of plain text for metadata, feeds, and share cards.
 * Headings, list items, paragraphs, and table rows stay separate sentences: a block that
 * does not already end with punctuation gets a period, or a colon after a heading.
 */
export function postMarkdownToPlainText(markdown: string) {
  return joinPlainTextBlocks(postMarkdownBlocks(markdown))
}

/**
 * Converts post Markdown to plain text with one block per line. List items keep a bullet or
 * their number so feed previews still read like the post.
 */
export function postMarkdownToPlainTextLines(markdown: string) {
  return postMarkdownBlocks(markdown)
    .map((block) => (block.marker ? `${block.marker} ${block.text}` : block.text))
    .join("\n")
}

export function commentMarkdownToPlainText(markdown: string) {
  const tree = gfmMarkdownProcessor.runSync(gfmMarkdownProcessor.parse(markdown), markdown)
  return joinPlainTextBlocks(markdownPlainTextBlocks(tree))
}

function joinPlainTextBlocks(blocks: readonly PlainTextBlock[]) {
  return blocks
    .map((block, index) => {
      const next = blocks[index + 1]
      if (!next || SENTENCE_END.test(block.text) || TRAILING_URL.test(block.text)) {
        return block.text
      }
      return `${block.text}${block.kind === "heading" && next.kind !== "heading" ? ":" : "."}`
    })
    .join(" ")
}

function collapseWhitespace(value: string) {
  return value.replaceAll(/\s+/gu, " ").trim()
}

function markdownPlainTextBlocks(node: MarkdownTextNode): PlainTextBlock[] {
  const blocks: PlainTextBlock[] = []
  collectPlainTextBlocks(node, null, blocks)
  return blocks
}

function pushBlock(
  blocks: PlainTextBlock[],
  kind: PlainTextBlock["kind"],
  marker: string | null,
  value: string,
) {
  const text = collapseWhitespace(value)
  if (text) blocks.push({ kind, marker, text })
}

function collectPlainTextBlocks(
  node: MarkdownTextNode,
  marker: string | null,
  blocks: PlainTextBlock[],
) {
  if (node.type === "table") {
    for (const row of node.children ?? []) {
      const cells = (row.children ?? [])
        .map((cell) => collapseWhitespace(markdownNodeToPlainText(cell)))
        .filter((cell) => cell.length > 0)
      pushBlock(blocks, "text", null, cells.join(", "))
    }
    return
  }
  if (TEXT_BLOCK_NODES.has(node.type)) {
    pushBlock(
      blocks,
      node.type === "heading" ? "heading" : "text",
      marker,
      markdownNodeToPlainText(node),
    )
    return
  }
  if (!BLOCK_CONTAINER_NODES.has(node.type)) return

  const directiveLabel =
    node.type === "containerDirective" &&
    (node.data?.hProperties?.dataPostDirective === "details" ||
      node.data?.hProperties?.dataPostDirective === "callout") &&
    typeof node.data.hProperties.dataLabel === "string"
      ? node.data.hProperties.dataLabel
      : ""
  if (directiveLabel) pushBlock(blocks, "heading", null, directiveLabel)

  const start = typeof node.start === "number" ? node.start : 1
  let pendingMarker = marker
  for (const [index, child] of (node.children ?? []).entries()) {
    if (node.type === "list") {
      collectPlainTextBlocks(
        child,
        node.ordered === true ? `${(start + index).toString()}.` : "•",
        blocks,
      )
      continue
    }
    // Only the first block of a list item carries its marker.
    const blockCount = blocks.length
    collectPlainTextBlocks(child, pendingMarker, blocks)
    if (blocks.length > blockCount) pendingMarker = null
  }
}

/** Flattens inline content, such as a paragraph or table cell, to text. */
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
  return (node.children ?? []).map((child) => markdownNodeToPlainText(child)).join("")
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
