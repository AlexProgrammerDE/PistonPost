import { describe, expect, test } from "bun:test"

import { commentCountLabel, heartCountLabel, optimisticHeartCount } from "./social-state"

describe("optimistic social state", () => {
  test("derives a pending heart count from the confirmed rollback baseline", () => {
    expect(optimisticHeartCount(4, false, true)).toBe(5)
    expect(optimisticHeartCount(4, true, false)).toBe(3)
    expect(optimisticHeartCount(4, true, true)).toBe(4)
    expect(optimisticHeartCount(0, true, false)).toBe(0)
  })

  test("describes heart counts with singular and plural wording", () => {
    expect(heartCountLabel(0)).toBe("0 hearts")
    expect(heartCountLabel(1)).toBe("1 heart")
    expect(heartCountLabel(2)).toBe("2 hearts")
  })

  test("describes comment counts with singular and plural wording", () => {
    expect(commentCountLabel(0)).toBe("0 comments")
    expect(commentCountLabel(1)).toBe("1 comment")
    expect(commentCountLabel(12)).toBe("12 comments")
  })
})
