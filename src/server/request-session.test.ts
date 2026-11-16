import { describe, expect, test } from "bun:test"

import { isBannedUser } from "./request-session"

describe("banned session users", () => {
  const now = new Date("2026-11-16T12:00:00Z")

  test("rejects a permanent ban and a ban that has not expired", () => {
    expect(isBannedUser({ banned: true, banExpires: null }, now)).toBeTrue()
    expect(
      isBannedUser({ banned: true, banExpires: new Date("2026-11-17T00:00:00Z") }, now),
    ).toBeTrue()
  })

  test("lets an expired ban and an unbanned user through", () => {
    expect(
      isBannedUser({ banned: true, banExpires: new Date("2026-11-15T00:00:00Z") }, now),
    ).toBeFalse()
    expect(isBannedUser({ banned: false, banExpires: null }, now)).toBeFalse()
    expect(isBannedUser({ banned: null }, now)).toBeFalse()
  })
})
