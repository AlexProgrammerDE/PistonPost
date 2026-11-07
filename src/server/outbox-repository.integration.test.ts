import { afterEach, describe, expect, it } from "bun:test"

import { sql } from "drizzle-orm"
import { Effect } from "effect"

import { createMigratedTestDatabase, createUser, schema } from "@/db"

import {
  createOutboxRepository,
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

describe("outbox owner settlement", () => {
  it("prevents an old attempt from releasing or completing its successor", async () => {
    const db = createDatabase()
    const repository = createOutboxRepository(db)
    await Effect.runPromise(repository.ensure("owned", "test", {}))
    const first = await Effect.runPromise(repository.claim("owned"))
    expect(first).toEqual({ _tag: "Claimed", attempt: 1 })
    db.update(schema.outbox)
      .set({ leaseExpiresAt: new Date(0) })
      .run()
    expect(await Effect.runPromise(repository.claim("owned"))).toEqual({
      _tag: "Claimed",
      attempt: 2,
    })
    await Effect.runPromise(repository.release("owned", 1, "old-error"))
    await Effect.runPromise(repository.complete("owned", 1, "stale"))
    expect(db.select().from(schema.outbox).get()).toMatchObject({
      attempts: 2,
      processedAt: null,
      lastError: null,
      leaseExpiresAt: expect.any(Date),
    })
    await Effect.runPromise(repository.complete("owned", 2, "current"))
    expect(db.select().from(schema.outbox).get()).toMatchObject({
      processedAt: expect.any(Date),
      leaseExpiresAt: null,
      completedReason: "current",
    })
  })

  it("guards both product delivery and outbox completion with the same attempt", async () => {
    const db = createDatabase()
    db.insert(schema.user).values(createUser()).run()
    db.insert(schema.emailCampaigns)
      .values({
        id: "campaign",
        subject: "Update",
        preview: "Preview",
        heading: "Update",
        message: "A product update",
      })
      .run()
    const repository = createOutboxRepository(db)
    await Effect.runPromise(repository.ensure("delivery", "email.product", {}))
    db.insert(schema.emailCampaignDeliveries)
      .values({ id: "delivery", campaignId: "campaign", recipientUserId: "test-user" })
      .run()
    await Effect.runPromise(repository.claim("delivery"))
    db.update(schema.outbox)
      .set({ leaseExpiresAt: new Date(0) })
      .run()
    await Effect.runPromise(repository.claim("delivery"))
    await Effect.runPromise(repository.completeProduct("delivery", 1, "stale", "sent"))
    expect(db.select().from(schema.emailCampaignDeliveries).get()?.status).toBe("queued")
    expect(db.select().from(schema.outbox).get()?.processedAt).toBeNull()
    await Effect.runPromise(repository.completeProduct("delivery", 2, "provider-accepted", "sent"))
    expect(db.select().from(schema.emailCampaignDeliveries).get()).toMatchObject({
      status: "sent",
      completedAt: expect.any(Date),
    })
    expect(db.select().from(schema.outbox).get()?.completedReason).toBe("provider-accepted")
  })
})
