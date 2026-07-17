import { markdownToPlainText } from "@/lib/markdown"

export const POST_TEXT_PREVIEW_GRAPHEME_LIMIT = 800

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
})

interface PostTextPreviewResult {
  readonly text: string
  readonly truncated: boolean
}

export function createPostTextPreview(markdown: string): PostTextPreviewResult {
  const plainText = markdownToPlainText(markdown)
  let preview = ""
  let graphemeCount = 0

  for (const { segment } of graphemeSegmenter.segment(plainText)) {
    if (graphemeCount === POST_TEXT_PREVIEW_GRAPHEME_LIMIT) {
      return {
        text: `${preview.trimEnd()}…`,
        truncated: true,
      }
    }

    preview += segment
    graphemeCount += 1
  }

  return {
    text: plainText,
    truncated: false,
  }
}
