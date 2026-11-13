import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import { Cause, Deferred, Effect, Exit } from "effect"

import { createMigratedTestDatabase, schema } from "@/db"

import {
  createOutboxRepository,
  OutboxRepository,
  outboxRepositoryLayer,
} from "./outbox-repository"
import { QueueDeliveryError, withOutboxClaim } from "./queue-job"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})
function setup() {
  const db = createMigratedTestDatabase()
  databases.push(db)
  return { db, layer: outboxRepositoryLayer(db), job: { idempotencyKey: "job-one", type: "test" } }
}

describe("outbox job lifetime", () => {
  test("releases a claim when an interruptible lookup is cancelled before submission", async () => {
    const { db, layer, job } = setup()
    const started = Deferred.makeUnsafe<void>()
    const controller = new AbortController()
    const result = Effect.runPromiseExit(
      withOutboxClaim(job, () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.never
        }),
      ).pipe(Effect.provide(layer)),
      { signal: controller.signal },
    )
    await Effect.runPromise(Deferred.await(started))
    controller.abort()
    const exit = await result
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
    expect(db.select().from(schema.outbox).get()).toMatchObject({
      attempts: 1,
      leaseExpiresAt: null,
      processedAt: null,
    })
  })

  test("waits for a submitted delivery and its checkpoint before interruption returns", async () => {
    const { db, layer, job } = setup()
    const submitted = Deferred.makeUnsafe<void>()
    const finish = Deferred.makeUnsafe<void>()
    const controller = new AbortController()
    let settled = false
    const result = Effect.runPromiseExit(
      withOutboxClaim(job, (claim) =>
        Effect.gen(function* () {
          const outbox = yield* OutboxRepository
          yield* Deferred.succeed(submitted, undefined)
          yield* Deferred.await(finish)
          yield* outbox.complete(job.idempotencyKey, claim.attempt, "provider-accepted")
        }).pipe(Effect.uninterruptible),
      ).pipe(Effect.provide(layer)),
      { signal: controller.signal },
    ).then((exit) => {
      settled = true
      return exit
    })
    await Effect.runPromise(Deferred.await(submitted))
    controller.abort()
    await Effect.runPromise(Effect.yieldNow)
    expect(settled).toBe(false)
    expect(db.select().from(schema.outbox).get()?.leaseExpiresAt).not.toBeNull()
    await Effect.runPromise(Deferred.succeed(finish, undefined))
    await result
    expect(db.select().from(schema.outbox).get()).toMatchObject({
      processedAt: expect.any(Date),
      completedReason: "provider-accepted",
      leaseExpiresAt: null,
      lastError: null,
    })
  })

  test("releases defective work and keeps provider rate-limit spacing", async () => {
    const { db, layer, job } = setup()
    await Effect.runPromiseExit(
      withOutboxClaim(job, () => Effect.die(new Error("defect"))).pipe(Effect.provide(layer)),
    )
    expect(db.select().from(schema.outbox).get()?.leaseExpiresAt).toBeNull()
    db.update(schema.outbox)
      .set({ availableAt: new Date(0) })
      .run()
    const now = Date.now()
    await Effect.runPromiseExit(
      withOutboxClaim(job, () =>
        Effect.fail(
          new QueueDeliveryError({ operation: "provider-limit", retryAfterSeconds: 120 }),
        ),
      ).pipe(Effect.provide(layer)),
    )
    const row = db.select().from(schema.outbox).get()
    expect(row?.availableAt.getTime()).toBeGreaterThanOrEqual(now + 120_000)
    expect(row?.lastError).toBe("QueueDeliveryError")
  })

  test("does not execute completed or deferred work", async () => {
    const { db, layer, job } = setup()
    const repository = createOutboxRepository(db)
    await Effect.runPromise(repository.ensure(job.idempotencyKey, job.type, job))
    db.update(schema.outbox)
      .set({ availableAt: new Date(Date.now() + 120_000) })
      .run()
    let called = false
    const run = withOutboxClaim(job, () =>
      Effect.sync(() => {
        called = true
      }),
    ).pipe(Effect.provide(layer))
    expect(Effect.runPromise(run)).rejects.toMatchObject({ operation: "outbox-deferred" })
    db.update(schema.outbox)
      .set({ availableAt: new Date(0), processedAt: new Date() })
      .where(eq(schema.outbox.id, job.idempotencyKey))
      .run()
    await Effect.runPromise(run)
    expect(called).toBe(false)
  })
})
