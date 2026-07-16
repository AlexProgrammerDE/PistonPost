import { describe, expect, test } from "bun:test"

import { applyMarkdownCommand } from "./markdown-editor"

describe("Markdown editor commands", () => {
  test("wraps a selection and keeps the selected text active", () => {
    expect(applyMarkdownCommand("hello world", 6, 11, "bold")).toEqual({
      value: "hello **world**",
      selectionStart: 8,
      selectionEnd: 13,
    })
  })

  test("inserts a link and selects the destination for replacement", () => {
    expect(applyMarkdownCommand("", 0, 0, "link")).toEqual({
      value: "[link text](https://)",
      selectionStart: 12,
      selectionEnd: 20,
    })
  })

  test("numbers every selected line with stable ordering", () => {
    expect(applyMarkdownCommand("one\ntwo", 0, 7, "ordered-list")).toEqual({
      value: "1. one\n2. two",
      selectionStart: 0,
      selectionEnd: 13,
    })
  })

  test("separates inserted block content from adjacent prose", () => {
    expect(applyMarkdownCommand("beforeafter", 6, 6, "table")).toEqual({
      value: "before\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n\nafter",
      selectionStart: 61,
      selectionEnd: 61,
    })
  })
})
