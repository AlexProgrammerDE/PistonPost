import { describe, expect, test } from "bun:test"

import { formatAbsoluteDate, formatAbsoluteDateTime, formatRelativeDateTime } from "./DateTime"

const now = new Date("2026-07-19T16:00:00.000Z")

describe("DateTime formatting", () => {
  test("uses relative wording only for the recent seven-day window", () => {
    expect(formatRelativeDateTime(new Date(now.getTime() - 59_000), now, "UTC")).toBe("just now")
    expect(formatRelativeDateTime(new Date(now.getTime() - 60_000), now, "UTC")).toBe(
      "1 minute ago",
    )
    expect(formatRelativeDateTime(new Date(now.getTime() - 59 * 60_000), now, "UTC")).toBe(
      "59 minutes ago",
    )
    expect(formatRelativeDateTime(new Date(now.getTime() - 60 * 60_000), now, "UTC")).toBe(
      "1 hour ago",
    )
    expect(formatRelativeDateTime(new Date(now.getTime() - 6 * 24 * 60 * 60_000), now, "UTC")).toBe(
      "6 days ago",
    )
  })

  test("switches to a calendar date after seven days and includes a different year", () => {
    expect(formatRelativeDateTime(new Date("2026-07-12T16:00:00.000Z"), now, "UTC")).toBe("Jul 12")
    expect(formatRelativeDateTime(new Date("2025-12-31T16:00:00.000Z"), now, "UTC")).toBe(
      "Dec 31, 2025",
    )
  })

  test("formats deterministic absolute labels and tooltip text", () => {
    const value = new Date("2026-07-19T14:42:00.000Z")

    expect(formatAbsoluteDate(value, "UTC")).toBe("Jul 19, 2026")
    expect(formatAbsoluteDateTime(value, "UTC")).toBe("Jul 19, 2026, 2:42 PM UTC")
  })
})
