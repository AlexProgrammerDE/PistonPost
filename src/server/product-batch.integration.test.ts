import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import { Deferred, Effect, Layer } from "effect"

import { createMigratedTestDatabase, createUser, schema } from "@/db"
import { productEmailBatchJob, productEmailJob } from "@/email/jobs"

import { outboxRepositoryLayer } from "./outbox-repository"
import {
  deliverProductBatch,
  ProductBatchDispatch,
  ProductBatchStore,
  productBatchDispatchLayer,
  productBatchStoreLayer,
} from "./product-batch"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})
function setup(count: number) {
  const db = createMigratedTestDatabase()
  databases.push(db)
  for (let index = 0; index < count; index++) {
    const id = `user-${index.toString().padStart(3, "0")}`
    db.insert(schema.user)
      .values(createUser({ id, email: `${id}@example.com` }))
      .run()
    db.insert(schema.userSettings).values({ userId: id, productNotifications: true }).run()
  }
  db.insert(schema.user)
    .values(createUser({ id: "opted-out", email: "opted-out@example.com" }))
    .run()
  db.insert(schema.userSettings).values({ userId: "opted-out", productNotifications: false }).run()
  db.insert(schema.emailCampaigns)
    .values({
      id: "campaign",
      status: "sending",
      subject: "Update",
      preview: "Preview",
      heading: "Update",
      message: "A product update",
    })
    .run()
  const services = Layer.mergeAll(outboxRepositoryLayer(db), productBatchStoreLayer(db))
  return { db, services, job: productEmailBatchJob("campaign", null) }
}

describe("product campaign batch workflow", () => {
  test("persists recipients and continuation before dispatch, then completes the final page", async () => {
    const { db, services, job } = setup(101)
    const sent: Array<Array<{ type: string; idempotencyKey: string }>> = []
    const dispatch = productBatchDispatchLayer(async (jobs) => {
      for (const next of jobs)
        expect(
          db.select().from(schema.outbox).where(eq(schema.outbox.id, next.idempotencyKey)).get(),
        ).toBeDefined()
      sent.push(jobs)
    })
    const layer = Layer.merge(services, dispatch)
    await Effect.runPromise(deliverProductBatch(job).pipe(Effect.provide(layer)))
    expect(db.select().from(schema.emailCampaignDeliveries).all()).toHaveLength(100)
    expect(db.select().from(schema.emailCampaigns).get()?.status).toBe("sending")
    const next = productEmailBatchJob("campaign", "user-099")
    expect(sent[0]?.at(-1)).toEqual(next)
    await Effect.runPromise(deliverProductBatch(next).pipe(Effect.provide(layer)))
    expect(db.select().from(schema.emailCampaignDeliveries).all()).toHaveLength(101)
    expect(db.select().from(schema.emailCampaigns).get()).toMatchObject({
      status: "sent",
      sentAt: expect.any(Date),
    })
    expect(sent[1]?.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      productEmailJob("user-100", "campaign").idempotencyKey,
    ])
  })

  test("a failed dispatch retains durable jobs and retry does not duplicate recipients", async () => {
    const { db, services, job } = setup(2)
    expect(
      Effect.runPromise(
        deliverProductBatch(job).pipe(
          Effect.provide(
            Layer.merge(
              services,
              productBatchDispatchLayer(async () => {
                throw new Error("queue unavailable")
              }),
            ),
          ),
        ),
      ),
    ).rejects.toMatchObject({ operation: "product-batch.dispatch" })
    expect(db.select().from(schema.emailCampaignDeliveries).all()).toHaveLength(2)
    const failed = db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.id, job.idempotencyKey))
      .get()
    expect(failed).toMatchObject({ leaseExpiresAt: null, processedAt: null })
    db.update(schema.outbox)
      .set({ availableAt: new Date(0) })
      .where(eq(schema.outbox.id, job.idempotencyKey))
      .run()
    await Effect.runPromise(
      deliverProductBatch(job).pipe(
        Effect.provide(
          Layer.merge(
            services,
            productBatchDispatchLayer(async () => undefined),
          ),
        ),
      ),
    )
    expect(db.select().from(schema.emailCampaignDeliveries).all()).toHaveLength(2)
    expect(
      db.select().from(schema.outbox).where(eq(schema.outbox.id, job.idempotencyKey)).get()
        ?.completedReason,
    ).toBe("batch-created")
  })

  test("interruption during dispatch waits for settlement and a replay does not submit again", async () => {
    const { db, services, job } = setup(1)
    const started = Deferred.makeUnsafe<void>()
    const finish = Deferred.makeUnsafe<void>()
    let submissions = 0
    const layer = Layer.merge(
      services,
      Layer.succeed(ProductBatchDispatch, {
        send: () =>
          Effect.gen(function* () {
            submissions++
            yield* Deferred.succeed(started, undefined)
            yield* Deferred.await(finish)
          }),
      }),
    )
    const controller = new AbortController()
    const result = Effect.runPromiseExit(deliverProductBatch(job).pipe(Effect.provide(layer)), {
      signal: controller.signal,
    })
    await Effect.runPromise(Deferred.await(started))
    controller.abort()
    await Effect.runPromise(Effect.yieldNow)
    expect(
      db.select().from(schema.outbox).where(eq(schema.outbox.id, job.idempotencyKey)).get()
        ?.processedAt,
    ).toBeNull()
    await Effect.runPromise(Deferred.succeed(finish, undefined))
    await result
    expect(
      db.select().from(schema.outbox).where(eq(schema.outbox.id, job.idempotencyKey)).get()
        ?.processedAt,
    ).toBeInstanceOf(Date)
    await Effect.runPromise(deliverProductBatch(job).pipe(Effect.provide(layer)))
    expect(submissions).toBe(1)
  })

  test("staging rolls back its outbox row if the recipient receipt cannot be saved", async () => {
    const { db, services } = setup(0)
    const stage = Effect.gen(function* () {
      const store = yield* ProductBatchStore
      yield* store.stage([productEmailJob("missing-user", "campaign")])
    })
    expect(Effect.runPromise(stage.pipe(Effect.provide(services)))).rejects.toMatchObject({
      operation: "product-batch.stage-recipients",
    })
    expect(db.select().from(schema.outbox).all()).toHaveLength(0)
    expect(db.select().from(schema.emailCampaignDeliveries).all()).toHaveLength(0)
  })
})
