import { describe, expect, test } from "bun:test"

import { heartCountLabel, optimisticHeartCount } from "./social-state"

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
})
