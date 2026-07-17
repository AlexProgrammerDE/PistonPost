import { describe, expect, test } from "bun:test"

import { notificationEnabled } from "./notification-policy"

describe("notification preferences", () => {
  test("uses the category preference without a master switch", () => {
    expect(notificationEnabled(null)).toBe(true)
    expect(notificationEnabled(true)).toBe(true)
    expect(notificationEnabled(false)).toBe(false)
  })
})
