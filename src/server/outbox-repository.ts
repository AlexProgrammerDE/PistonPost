import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Clock, Context, Effect, Layer, Schema } from "effect"

import type { D1DatabaseClient } from "@/db/d1-database"
import type { SqliteDatabaseClient } from "@/db/database"
import * as schema from "@/db/schema"

import { bindingOperation } from "./operation"

type Database = D1DatabaseClient | SqliteDatabaseClient

export type OutboxClaim =
  | Readonly<{ _tag: "Claimed"; attempt: number }>
  | Readonly<{ _tag: "Complete" }>
  | Readonly<{ _tag: "Deferred"; retryAfterSeconds: number }>
  | Readonly<{ _tag: "Unavailable" }>

export class OutboxRepositoryError extends Schema.TaggedError<OutboxRepositoryError>()(
  "OutboxRepositoryError",
  { operation: Schema.String },
) {}

export class OutboxRepository extends Context.Service<
  OutboxRepository,
  {
    readonly ensure: (
      id: string,
      kind: string,
      payload: schema.OutboxPayload,
    ) => Effect.Effect<void, OutboxRepositoryError>
    readonly claim: (id: string) => Effect.Effect<OutboxClaim, OutboxRepositoryError>
    readonly complete: (
      id: string,
      attempt: number,
      reason: string,
    ) => Effect.Effect<void, OutboxRepositoryError>
    readonly completeProduct: (
      id: string,
      attempt: number,
      reason: string,
      status: "sent" | "skipped",
    ) => Effect.Effect<void, OutboxRepositoryError>
    readonly release: (
      id: string,
      attempt: number,
      errorCode: string,
      minimumDelayMs?: number,
    ) => Effect.Effect<void, OutboxRepositoryError>
  }
>()("@pistonpost/email/OutboxRepository") {}

const leaseDurationMs = 5 * 60 * 1_000

export function outboxClaimCondition(id: string, now: Date) {
  return and(
    eq(schema.outbox.id, id),
    isNull(schema.outbox.processedAt),
    isNull(schema.outbox.deadLetteredAt),
    lte(schema.outbox.availableAt, now),
    or(isNull(schema.outbox.leaseExpiresAt), lte(schema.outbox.leaseExpiresAt, now)),
  )
}

function outboxOwnerCondition(id: string, attempt: number) {
  return and(
    eq(schema.outbox.id, id),
    eq(schema.outbox.attempts, attempt),
    isNotNull(schema.outbox.leaseExpiresAt),
    isNull(schema.outbox.processedAt),
    isNull(schema.outbox.deadLetteredAt),
  )
}

export function outboxRetryDelayMs(attempt: number) {
  return Math.min(15 * 60 * 1_000, 30_000 * 2 ** Math.max(0, attempt - 1))
}

export function outboxRetryAfterSeconds(availableAt: Date, now: Date) {
  return Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 1_000))
}

function repositoryOperation<A>(operation: string, task: () => A | PromiseLike<A>) {
  return bindingOperation(`outbox.${operation}`, task).pipe(
    Effect.mapError(() => new OutboxRepositoryError({ operation })),
  )
}

export function createOutboxRepository(
  database: Database,
): Context.Service.Shape<typeof OutboxRepository> {
  const db: BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema> = database
  return {
    ensure: (id, kind, payload) =>
      repositoryOperation("ensure", () =>
        db.insert(schema.outbox).values({ id, kind, payload }).onConflictDoNothing(),
      ).pipe(Effect.asVoid),
    claim: Effect.fn("Outbox.claim")(function* (id) {
      const now = new Date(yield* Clock.currentTimeMillis)
      // Return the attempt from the claiming statement. A later read could observe a successor.
      const claimed = yield* repositoryOperation("claim", () =>
        db
          .update(schema.outbox)
          .set({
            attempts: sql`${schema.outbox.attempts} + 1`,
            leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
            lastError: null,
          })
          .where(outboxClaimCondition(id, now))
          .returning({ attempt: schema.outbox.attempts }),
      )
      const owner = claimed[0]
      if (owner) return { _tag: "Claimed", attempt: owner.attempt } satisfies OutboxClaim
      const row = yield* repositoryOperation("claim-status", () =>
        db
          .select({
            processedAt: schema.outbox.processedAt,
            deadLetteredAt: schema.outbox.deadLetteredAt,
            availableAt: schema.outbox.availableAt,
          })
          .from(schema.outbox)
          .where(eq(schema.outbox.id, id))
          .get(),
      )
      if (row?.processedAt || row?.deadLetteredAt) return { _tag: "Complete" } satisfies OutboxClaim
      return row && row.availableAt.getTime() > now.getTime()
        ? ({
            _tag: "Deferred",
            retryAfterSeconds: outboxRetryAfterSeconds(row.availableAt, now),
          } satisfies OutboxClaim)
        : ({ _tag: "Unavailable" } satisfies OutboxClaim)
    }),
    complete: Effect.fn("Outbox.complete")(function* (id, attempt, reason) {
      const now = new Date(yield* Clock.currentTimeMillis)
      yield* repositoryOperation("complete", () =>
        db
          .update(schema.outbox)
          .set({ processedAt: now, leaseExpiresAt: null, completedReason: reason, lastError: null })
          .where(outboxOwnerCondition(id, attempt)),
      )
    }),
    completeProduct: Effect.fn("Outbox.completeProduct")(function* (id, attempt, reason, status) {
      const completedAt = new Date(yield* Clock.currentTimeMillis)
      const values = {
        status,
        skipReason: status === "skipped" ? reason : null,
        completedAt,
      }
      yield* repositoryOperation("complete-product", async () => {
        if ("batch" in database) {
          // Update the delivery first, while the matching claim is still present, in the same batch.
          await database.batch([
            db
              .update(schema.emailCampaignDeliveries)
              .set(values)
              .where(
                and(
                  eq(schema.emailCampaignDeliveries.id, id),
                  sql`exists (select 1 from ${schema.outbox} where ${outboxOwnerCondition(id, attempt)})`,
                ),
              ),
            db
              .update(schema.outbox)
              .set({
                processedAt: completedAt,
                leaseExpiresAt: null,
                completedReason: reason,
                lastError: null,
              })
              .where(outboxOwnerCondition(id, attempt)),
          ])
          return
        }
        database.transaction((transaction) => {
          transaction
            .update(schema.emailCampaignDeliveries)
            .set(values)
            .where(
              and(
                eq(schema.emailCampaignDeliveries.id, id),
                sql`exists (select 1 from ${schema.outbox} where ${outboxOwnerCondition(id, attempt)})`,
              ),
            )
            .run()
          transaction
            .update(schema.outbox)
            .set({
              processedAt: completedAt,
              leaseExpiresAt: null,
              completedReason: reason,
              lastError: null,
            })
            .where(outboxOwnerCondition(id, attempt))
            .run()
        })
      })
    }),
    release: Effect.fn("Outbox.release")(function* (id, attempt, errorCode, minimumDelayMs) {
      const now = yield* Clock.currentTimeMillis
      const delayMs = Math.max(outboxRetryDelayMs(attempt), minimumDelayMs ?? 0)
      yield* repositoryOperation("release", () =>
        db
          .update(schema.outbox)
          .set({
            availableAt: new Date(now + delayMs),
            leaseExpiresAt: null,
            lastError: errorCode.slice(0, 120),
          })
          .where(outboxOwnerCondition(id, attempt)),
      )
    }),
  }
}

export function outboxRepositoryLayer(database: Database) {
  return Layer.succeed(OutboxRepository, createOutboxRepository(database))
}
