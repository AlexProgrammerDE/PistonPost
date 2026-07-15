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
})
