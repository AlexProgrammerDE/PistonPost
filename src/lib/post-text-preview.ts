import { postMarkdownToPlainTextLines } from "@/lib/markdown"

export const POST_TEXT_PREVIEW_GRAPHEME_LIMIT = 800

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
})

export function createPostTextPreview(markdown: string) {
  const plainText = postMarkdownToPlainTextLines(markdown)
  let preview = ""
  let graphemeCount = 0

  for (const { segment } of graphemeSegmenter.segment(plainText)) {
    if (graphemeCount === POST_TEXT_PREVIEW_GRAPHEME_LIMIT) {
      return `${preview.trimEnd()}…`
    }

    preview += segment
    graphemeCount += 1
  }

  return plainText
}
