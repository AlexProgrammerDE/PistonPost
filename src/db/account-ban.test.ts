import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"

import { bannedAccount, isBannedUser } from "./account-ban"
import { createUser } from "./factories"
import { user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

const now = new Date("2026-11-16T12:00:00Z")

const banStates = [
  { id: "permanent", banned: true, banExpires: null, expected: true },
  { id: "future", banned: true, banExpires: new Date("2026-11-17T00:00:00Z"), expected: true },
  { id: "expired", banned: true, banExpires: new Date("2026-11-15T00:00:00Z"), expected: false },
  { id: "expires-now", banned: true, banExpires: now, expected: false },
  { id: "unbanned", banned: false, banExpires: null, expected: false },
  { id: "unset", banned: null, banExpires: null, expected: false },
] as const

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("account ban rule", () => {
  test("applies a permanent ban and a ban that has not expired", () => {
    expect(isBannedUser({ banned: true, banExpires: null }, now)).toBeTrue()
    expect(
      isBannedUser({ banned: true, banExpires: new Date("2026-11-17T00:00:00Z") }, now),
    ).toBeTrue()
  })

  test("ignores an expired ban and an unbanned user", () => {
    expect(
      isBannedUser({ banned: true, banExpires: new Date("2026-11-15T00:00:00Z") }, now),
    ).toBeFalse()
    expect(isBannedUser({ banned: false, banExpires: null }, now)).toBeFalse()
    expect(isBannedUser({ banned: null }, now)).toBeFalse()
  })

  test("the SQL condition agrees with the runtime rule", () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database
      .insert(user)
      .values(
        banStates.map((state) =>
          createUser({
            id: state.id,
            email: `${state.id}@example.com`,
            banned: state.banned,
            banExpires: state.banExpires,
          }),
        ),
      )
      .run()

    for (const state of banStates) {
      const row = database
        .select({ banned: bannedAccount(user.id, now) })
        .from(user)
        .where(eq(user.id, state.id))
        .get()
      expect({ id: state.id, banned: row?.banned }).toEqual({
        id: state.id,
        banned: state.expected,
      })
      expect(isBannedUser(state, now)).toBe(state.expected)
    }
  })
})
