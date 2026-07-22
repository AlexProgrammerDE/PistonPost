import { describe, expect, test } from "bun:test"

import { notificationEnabled, optInNotificationEnabled } from "./notification-policy"

describe("notification preferences", () => {
  test("uses the category preference without a master switch", () => {
    expect(notificationEnabled(null)).toBe(true)
    expect(notificationEnabled(true)).toBe(true)
    expect(notificationEnabled(false)).toBe(false)
  })

  test("requires an explicit opt-in for product email", () => {
    expect(optInNotificationEnabled(null)).toBe(false)
    expect(optInNotificationEnabled(false)).toBe(false)
    expect(optInNotificationEnabled(true)).toBe(true)
  })
})
