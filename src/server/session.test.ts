import { describe, expect, test } from "bun:test"

import { isActiveAdministrator } from "./session"

describe("administrator authorization", () => {
  test("uses fresh database role state instead of cached client state", () => {
    expect(isActiveAdministrator({ role: "admin", banned: false })).toBeTrue()
    expect(isActiveAdministrator({ role: "user", banned: false })).toBeFalse()
    expect(isActiveAdministrator({ role: "admin", banned: true })).toBeFalse()
    expect(isActiveAdministrator(undefined)).toBeFalse()
  })
})
