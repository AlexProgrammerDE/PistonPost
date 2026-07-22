import { describe, expect, test } from "bun:test"

import { applyMarkdownCommand, applyMarkdownPaste } from "./markdown-editor"

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

  test("adds spoiler, details, and callout directives", () => {
    expect(applyMarkdownCommand("hello secret", 6, 12, "spoiler")).toEqual({
      value: "hello :spoiler[secret]",
      selectionStart: 15,
      selectionEnd: 21,
    })

    const details = applyMarkdownCommand("", 0, 0, "details")
    expect(details.value).toBe(":::details[More details]\nHidden details\n:::")
    expect(details.value.slice(details.selectionStart, details.selectionEnd)).toBe("Hidden details")

    const callout = applyMarkdownCommand("Useful", 0, 6, "callout")
    expect(callout.value).toBe(":::callout[Note]{kind=note}\nUseful\n:::")
    expect(callout.value.slice(callout.selectionStart, callout.selectionEnd)).toBe("Useful")
  })

  test("turns a supported provider URL pasted on an empty line into an embed directive", () => {
    const value = "https://youtu.be/M7lc1UVf-VE?t=30"
    const directive = '::embed{url="https://youtu.be/M7lc1UVf-VE?t=30"}'

    expect(applyMarkdownPaste("", 0, 0, value)).toEqual({
      value: directive,
      selectionStart: directive.length,
      selectionEnd: directive.length,
    })
  })

  test("uses the same embed directive for social providers", () => {
    const source = "https://x.com/OpenAI/status/1234567890123456789"
    const directive = `::embed{url="${source}"}`
    expect(applyMarkdownPaste("", 0, 0, source)).toEqual({
      value: directive,
      selectionStart: directive.length,
      selectionEnd: directive.length,
    })
  })

  test("turns an external URL pasted on a blank line into a link card directive", () => {
    const directive = '::card{url="https://example.com/"}'

    expect(applyMarkdownPaste("before\n   \nafter", 9, 9, " https://example.com \n")).toEqual({
      value: `before\n${directive}\nafter`,
      selectionStart: 7 + directive.length,
      selectionEnd: 7 + directive.length,
    })
  })

  test("leaves ordinary and inline pastes to the textarea", () => {
    expect(applyMarkdownPaste("before", 6, 6, "https://example.com")).toBeNull()
    expect(applyMarkdownPaste("", 0, 0, "/post/one")).toBeNull()
    expect(applyMarkdownPaste("replace", 0, 7, "https://example.com")).toBeNull()
  })
})
