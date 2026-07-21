import { afterEach, describe, expect, it } from "bun:test"

import { sql } from "drizzle-orm"

import { createMigratedTestDatabase, schema } from "@/db"

import {
  outboxClaimCondition,
  outboxRetryAfterSeconds,
  outboxRetryDelayMs,
} from "./outbox-repository"

const databases: Array<ReturnType<typeof createMigratedTestDatabase>> = []

afterEach(() => {
  for (const testDatabase of databases) testDatabase.$client.close()
  databases.length = 0
})

function createDatabase() {
  const value = createMigratedTestDatabase()
  databases.push(value)
  return value
}

describe("outbox claim policy", () => {
  it("allows one claim until its lease expires", () => {
    const db = createDatabase()
    db.insert(schema.outbox)
      .values({ id: "job-one", kind: "email.comment", payload: { version: 2 } })
      .run()
    const now = new Date()
    const claim = () =>
      db
        .update(schema.outbox)
        .set({
          attempts: sql`${schema.outbox.attempts} + 1`,
          leaseExpiresAt: new Date(now.getTime() + 60_000),
        })
        .where(outboxClaimCondition("job-one", now))
        .run()

    claim()
    claim()
    expect(db.select().from(schema.outbox).get()?.attempts).toBe(1)

    db.update(schema.outbox)
      .set({ leaseExpiresAt: new Date(now.getTime() - 1) })
      .run()
    claim()
    expect(db.select().from(schema.outbox).get()?.attempts).toBe(2)
  })

  it("does not reclaim completed or dead-lettered work", () => {
    const db = createDatabase()
    const now = new Date()
    db.insert(schema.outbox)
      .values([
        {
          id: "complete",
          kind: "email.comment",
          payload: { version: 2 },
          processedAt: now,
        },
        {
          id: "dead-lettered",
          kind: "email.comment",
          payload: { version: 2 },
          deadLetteredAt: now,
        },
      ])
      .run()

    for (const id of ["complete", "dead-lettered"]) {
      db.update(schema.outbox)
        .set({ attempts: sql`${schema.outbox.attempts} + 1` })
        .where(outboxClaimCondition(id, now))
        .run()
    }
    expect(
      db
        .select()
        .from(schema.outbox)
        .all()
        .map(({ attempts }) => attempts),
    ).toEqual([0, 0])
  })

  it("caps retry spacing at fifteen minutes", () => {
    expect(outboxRetryDelayMs(1)).toBe(30_000)
    expect(outboxRetryDelayMs(2)).toBe(60_000)
    expect(outboxRetryDelayMs(20)).toBe(15 * 60 * 1_000)
  })

  it("delays a queue retry until deferred outbox work is available", () => {
    const now = new Date("2026-07-21T12:00:00.000Z")
    expect(outboxRetryAfterSeconds(new Date(now.getTime() + 90_001), now)).toBe(91)
    expect(outboxRetryAfterSeconds(new Date(now.getTime() - 1), now)).toBe(1)
  })
})
