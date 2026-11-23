import { postMarkdownToPlainTextLines } from "@/lib/markdown"

export const POST_TEXT_PREVIEW_GRAPHEME_LIMIT = 800

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
})

export type PostTextPreview = {
  readonly text: string
  /** True when the preview dropped text that the full post shows. */
  readonly shortened: boolean
}

export function createPostTextPreview(markdown: string): PostTextPreview {
  const plainText = postMarkdownToPlainTextLines(markdown)
  let preview = ""
  let graphemeCount = 0

  for (const { segment } of graphemeSegmenter.segment(plainText)) {
    if (graphemeCount === POST_TEXT_PREVIEW_GRAPHEME_LIMIT) {
      return { text: `${preview.trimEnd()}…`, shortened: true }
    }

    preview += segment
    graphemeCount += 1
  }

  return { text: plainText, shortened: false }
}
