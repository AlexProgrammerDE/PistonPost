import { describe, expect, it } from "bun:test"

import { generateN } from "./generate-n"

describe("generateN", () => {
  it("creates stable one-based identities", () => {
    expect(generateN(4)).toEqual([1, 2, 3, 4])
  })

  it("normalizes invalid sequence lengths", () => {
    expect(generateN(-2)).toEqual([])
    expect(generateN(2.8)).toEqual([1, 2])
  })
})
