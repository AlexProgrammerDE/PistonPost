import { postDirectiveForUrl } from "./markdown-directives"

export type MarkdownCommand =
  | "bold"
  | "italic"
  | "strikethrough"
  | "link"
  | "heading"
  | "quote"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "inline-code"
  | "code-block"
  | "table"

export type MarkdownEdit = {
  readonly value: string
  readonly selectionStart: number
  readonly selectionEnd: number
}

function replaceSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
  nextSelectionStart: number,
  nextSelectionEnd: number,
): MarkdownEdit {
  return {
    value: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + nextSelectionStart,
    selectionEnd: selectionStart + nextSelectionEnd,
  }
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  placeholder: string,
) {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder
  return replaceSelection(
    value,
    selectionStart,
    selectionEnd,
    `${before}${selected}${after}`,
    before.length,
    before.length + selected.length,
  )
}

function prefixSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: (index: number) => string,
) {
  const blockStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1
  const nextLine = value.indexOf("\n", selectionEnd)
  const blockEnd = nextLine === -1 ? value.length : nextLine
  const lines = value.slice(blockStart, blockEnd).split("\n")
  const replacement = lines.map((line, index) => `${prefix(index)}${line}`).join("\n")
  return replaceSelection(value, blockStart, blockEnd, replacement, 0, replacement.length)
}

function insertBlock(value: string, selectionStart: number, selectionEnd: number, block: string) {
  const before = selectionStart > 0 && value[selectionStart - 1] !== "\n" ? "\n\n" : ""
  const after = selectionEnd < value.length && value[selectionEnd] !== "\n" ? "\n\n" : ""
  const replacement = `${before}${block}${after}`
  const caret = before.length + block.length
  return replaceSelection(value, selectionStart, selectionEnd, replacement, caret, caret)
}

export function applyMarkdownPaste(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  pastedText: string,
): MarkdownEdit | null {
  if (selectionStart !== selectionEnd) return null

  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1
  const nextLine = value.indexOf("\n", selectionStart)
  const lineEnd = nextLine === -1 ? value.length : nextLine
  if (value.slice(lineStart, lineEnd).trim()) return null

  const directive = postDirectiveForUrl(pastedText.trim())
  return directive ? insertBlock(value, lineStart, lineEnd, directive) : null
}

export function applyMarkdownCommand(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  command: MarkdownCommand,
): MarkdownEdit {
  if (command === "bold") {
    return wrapSelection(value, selectionStart, selectionEnd, "**", "**", "bold text")
  }
  if (command === "italic") {
    return wrapSelection(value, selectionStart, selectionEnd, "_", "_", "italic text")
  }
  if (command === "strikethrough") {
    return wrapSelection(value, selectionStart, selectionEnd, "~~", "~~", "struck text")
  }
  if (command === "inline-code") {
    return wrapSelection(value, selectionStart, selectionEnd, "`", "`", "code")
  }
  if (command === "code-block") {
    return wrapSelection(value, selectionStart, selectionEnd, "```\n", "\n```", "code")
  }
  if (command === "link") {
    const selected = value.slice(selectionStart, selectionEnd) || "link text"
    const replacement = `[${selected}](https://)`
    const urlStart = selected.length + 3
    return replaceSelection(
      value,
      selectionStart,
      selectionEnd,
      replacement,
      urlStart,
      urlStart + "https://".length,
    )
  }
  if (command === "heading") {
    return prefixSelectedLines(value, selectionStart, selectionEnd, () => "## ")
  }
  if (command === "quote") {
    return prefixSelectedLines(value, selectionStart, selectionEnd, () => "> ")
  }
  if (command === "bullet-list") {
    return prefixSelectedLines(value, selectionStart, selectionEnd, () => "- ")
  }
  if (command === "ordered-list") {
    return prefixSelectedLines(value, selectionStart, selectionEnd, (index) => `${index + 1}. `)
  }
  if (command === "task-list") {
    return prefixSelectedLines(value, selectionStart, selectionEnd, () => "- [ ] ")
  }
  return insertBlock(
    value,
    selectionStart,
    selectionEnd,
    "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |",
  )
}
