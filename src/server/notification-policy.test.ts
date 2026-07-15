import { describe, expect, test } from "bun:test"

import { notificationEnabled } from "./notification-policy"

describe("notification preferences", () => {
  test("uses opt-out defaults but always respects master and category suppression", () => {
    expect(notificationEnabled(null, null)).toBe(true)
    expect(notificationEnabled(true, false)).toBe(false)
    expect(notificationEnabled(false, true)).toBe(false)
    expect(notificationEnabled(false, false)).toBe(false)
  })
})
