import { describe, expect, it } from "bun:test"

import { addTagInputValues } from "./tag-input-state"

describe("tag input state", () => {
  it("normalizes pasted separators and preserves the first display spelling", () => {
    expect(addTagInputValues(["Art"], " #art, friends\nMemes ")).toEqual([
      "Art",
      "friends",
      "Memes",
    ])
  })

  it("stops at the configured limit without replacing existing values", () => {
    expect(addTagInputValues(["one", "two"], "three,four,five", 4)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ])
  })

  it("normalizes invalid characters before adding tags", () => {
    expect(addTagInputValues([], "##Furry art & memes!, !!!, valid_tag~2")).toEqual([
      "Furry-art-memes",
      "valid_tag~2",
    ])
  })

  it("deduplicates and limits tags after normalization", () => {
    expect(addTagInputValues(["Furry-Art"], `furry art, ${"a".repeat(65)}`)).toEqual([
      "Furry-Art",
      "a".repeat(64),
    ])
  })
})
