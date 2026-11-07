import { and, eq, gt } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Clock, Context, Effect, Layer } from "effect"

import type { D1DatabaseClient } from "@/db/d1-database"
import type { SqliteDatabaseClient } from "@/db/database"
import * as schema from "@/db/schema"
import {
  productEmailBatchJob,
  productEmailJob,
  type ProductEmailBatchJob,
  type ProductEmailJob,
} from "@/email/jobs"

import { bindingOperation, type OperationError } from "./operation"
import { OutboxRepository } from "./outbox-repository"
import { withOutboxClaim } from "./queue-job"

type ProductJob = ProductEmailJob | ProductEmailBatchJob

export class ProductBatchStore extends Context.Service<
  ProductBatchStore,
  {
    readonly campaign: (
      id: string,
    ) => Effect.Effect<{ status: "draft" | "sending" | "sent" } | undefined, OperationError>
    readonly recipients: (
      cursor: string | null,
    ) => Effect.Effect<Array<{ id: string }>, OperationError>
    readonly stage: (jobs: ProductEmailJob[]) => Effect.Effect<void, OperationError>
    readonly continue: (job: ProductEmailBatchJob) => Effect.Effect<void, OperationError>
    readonly finish: (campaignId: string) => Effect.Effect<void, OperationError>
  }
>()("@pistonpost/email/ProductBatchStore") {}

export class ProductBatchDispatch extends Context.Service<
  ProductBatchDispatch,
  {
    readonly send: (jobs: ProductJob[]) => Effect.Effect<void, OperationError>
  }
>()("@pistonpost/email/ProductBatchDispatch") {}

export function productBatchStoreLayer(database: D1DatabaseClient | SqliteDatabaseClient) {
  const db: BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema> = database
  return Layer.succeed(ProductBatchStore, {
    campaign: (id) =>
      bindingOperation("product-batch.campaign", () =>
        db
          .select({ status: schema.emailCampaigns.status })
          .from(schema.emailCampaigns)
          .where(eq(schema.emailCampaigns.id, id))
          .get(),
      ),
    recipients: (cursor) =>
      bindingOperation("product-batch.recipients", () =>
        db
          .select({ id: schema.user.id })
          .from(schema.user)
          .innerJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
          .where(
            and(
              eq(schema.userSettings.productNotifications, true),
              cursor ? gt(schema.user.id, cursor) : undefined,
            ),
          )
          .orderBy(schema.user.id)
          .limit(100),
      ),
    stage: (jobs) =>
      bindingOperation("product-batch.stage-recipients", async () => {
        const [first, ...remaining] = jobs
        if (!first) return
        if ("batch" in database) {
          const statements = (job: ProductEmailJob) =>
            [
              database
                .insert(schema.outbox)
                .values({ id: job.idempotencyKey, kind: job.type, payload: job })
                .onConflictDoNothing(),
              database
                .insert(schema.emailCampaignDeliveries)
                .values({
                  id: job.idempotencyKey,
                  campaignId: job.campaignId,
                  recipientUserId: job.recipientUserId,
                })
                .onConflictDoNothing(),
            ] as const
          await database.batch([...statements(first), ...remaining.flatMap(statements)])
          return
        }
        database.transaction((transaction) => {
          for (const job of jobs) {
            transaction
              .insert(schema.outbox)
              .values({ id: job.idempotencyKey, kind: job.type, payload: job })
              .onConflictDoNothing()
              .run()
            transaction
              .insert(schema.emailCampaignDeliveries)
              .values({
                id: job.idempotencyKey,
                campaignId: job.campaignId,
                recipientUserId: job.recipientUserId,
              })
              .onConflictDoNothing()
              .run()
          }
        })
      }),
    continue: (job) =>
      bindingOperation("product-batch.continuation", () =>
        db
          .insert(schema.outbox)
          .values({ id: job.idempotencyKey, kind: job.type, payload: job })
          .onConflictDoNothing(),
      ).pipe(Effect.asVoid),
    finish: Effect.fn("ProductBatch.finish")(function* (campaignId) {
      const now = new Date(yield* Clock.currentTimeMillis)
      yield* bindingOperation("product-batch.finish-campaign", () =>
        db
          .update(schema.emailCampaigns)
          .set({ status: "sent", sentAt: now, updatedAt: now })
          .where(eq(schema.emailCampaigns.id, campaignId)),
      )
    }),
  })
}

export function productBatchDispatchLayer(send: (jobs: ProductJob[]) => Promise<unknown>) {
  return Layer.succeed(ProductBatchDispatch, {
    send: (jobs) =>
      bindingOperation("product-batch.dispatch", () => send(jobs)).pipe(Effect.asVoid),
  })
}

export const deliverProductBatch = Effect.fn("Queue.deliverProductBatch")(function* (
  job: ProductEmailBatchJob,
) {
  return yield* withOutboxClaim(job, (claim) =>
    Effect.gen(function* () {
      const outbox = yield* OutboxRepository
      const store = yield* ProductBatchStore
      const dispatch = yield* ProductBatchDispatch
      const campaign = yield* store.campaign(job.campaignId)
      if (!campaign || campaign.status === "draft") {
        yield* outbox.complete(job.idempotencyKey, claim.attempt, "batch-created")
        return
      }
      const recipients = yield* store.recipients(job.cursorUserId)
      const jobs = recipients.map(({ id }) => productEmailJob(id, job.campaignId))
      const last = recipients.at(-1)
      const next =
        recipients.length === 100 && last ? productEmailBatchJob(job.campaignId, last.id) : null
      const batches: ProductEmailJob[][] = []
      for (let offset = 0; offset < jobs.length; offset += 25)
        batches.push(jobs.slice(offset, offset + 25))
      // Once publication starts, finish staging, submission and this claim's settlement.
      yield* Effect.gen(function* () {
        yield* Effect.forEach(batches, (batch) => store.stage(batch), { concurrency: 4 })
        if (next) yield* store.continue(next)
        else yield* store.finish(job.campaignId)
        const dispatchJobs: ProductJob[] = next ? [...jobs, next] : jobs
        if (dispatchJobs.length > 0) yield* dispatch.send(dispatchJobs)
        yield* outbox.complete(job.idempotencyKey, claim.attempt, "batch-created")
      }).pipe(Effect.uninterruptible)
    }),
  )
})
