import { and, eq, isNull, lte, or, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

import type { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"

type Database = ReturnType<typeof createD1Database>

export type OutboxClaim =
  | Readonly<{ _tag: "Claimed"; attempt: number }>
  | Readonly<{ _tag: "Complete" }>
  | Readonly<{ _tag: "Deferred"; retryAfterSeconds: number }>
  | Readonly<{ _tag: "Unavailable" }>

export class OutboxRepositoryError extends Schema.TaggedError<OutboxRepositoryError>()(
  "OutboxRepositoryError",
  { operation: Schema.String },
) {}

export class OutboxRepository extends Context.Tag("@pistonpost/email/OutboxRepository")<
  OutboxRepository,
  {
    readonly ensure: (
      id: string,
      kind: string,
      payload: schema.OutboxPayload,
    ) => Effect.Effect<void, OutboxRepositoryError>
    readonly claim: (id: string) => Effect.Effect<OutboxClaim, OutboxRepositoryError>
    readonly complete: (id: string, reason: string) => Effect.Effect<void, OutboxRepositoryError>
    readonly completeProduct: (
      id: string,
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
>() {}

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

export function outboxRetryDelayMs(attempt: number) {
  return Math.min(15 * 60 * 1_000, 30_000 * 2 ** Math.max(0, attempt - 1))
}

export function outboxRetryAfterSeconds(availableAt: Date, now: Date) {
  return Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 1_000))
}

function repositoryError(operation: string) {
  return () => new OutboxRepositoryError({ operation })
}

export function outboxRepositoryLayer(database: Database) {
  return Layer.succeed(OutboxRepository, {
    ensure: (id, kind, payload) =>
      Effect.tryPromise({
        try: async () => {
          await database.insert(schema.outbox).values({ id, kind, payload }).onConflictDoNothing()
        },
        catch: repositoryError("ensure"),
      }),
    claim: (id) =>
      Effect.tryPromise({
        try: async () => {
          const now = new Date()
          const claim = await database
            .update(schema.outbox)
            .set({
              attempts: sql`${schema.outbox.attempts} + 1`,
              leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
              lastError: null,
            })
            .where(outboxClaimCondition(id, now))
            .run()
          if (claim.meta.changes > 0) {
            const row = await database
              .select({ attempts: schema.outbox.attempts })
              .from(schema.outbox)
              .where(eq(schema.outbox.id, id))
              .get()
            return { _tag: "Claimed", attempt: row?.attempts ?? 1 } satisfies OutboxClaim
          }
          const row = await database
            .select({
              processedAt: schema.outbox.processedAt,
              deadLetteredAt: schema.outbox.deadLetteredAt,
              availableAt: schema.outbox.availableAt,
            })
            .from(schema.outbox)
            .where(eq(schema.outbox.id, id))
            .get()
          if (row?.processedAt || row?.deadLetteredAt) {
            return { _tag: "Complete" } satisfies OutboxClaim
          }
          return row && row.availableAt.getTime() > now.getTime()
            ? ({
                _tag: "Deferred",
                retryAfterSeconds: outboxRetryAfterSeconds(row.availableAt, now),
              } satisfies OutboxClaim)
            : ({ _tag: "Unavailable" } satisfies OutboxClaim)
        },
        catch: repositoryError("claim"),
      }),
    complete: (id, reason) =>
      Effect.tryPromise({
        try: async () => {
          await database
            .update(schema.outbox)
            .set({
              processedAt: new Date(),
              leaseExpiresAt: null,
              completedReason: reason,
              lastError: null,
            })
            .where(and(eq(schema.outbox.id, id), isNull(schema.outbox.deadLetteredAt)))
        },
        catch: repositoryError("complete"),
      }),
    completeProduct: (id, reason, status) =>
      Effect.tryPromise({
        try: async () => {
          const completedAt = new Date()
          await database.batch([
            database
              .update(schema.outbox)
              .set({
                processedAt: completedAt,
                leaseExpiresAt: null,
                completedReason: reason,
                lastError: null,
              })
              .where(and(eq(schema.outbox.id, id), isNull(schema.outbox.deadLetteredAt))),
            database
              .update(schema.emailCampaignDeliveries)
              .set({
                status,
                skipReason: status === "skipped" ? reason : null,
                completedAt,
              })
              .where(eq(schema.emailCampaignDeliveries.id, id)),
          ])
        },
        catch: repositoryError("complete-product"),
      }),
    release: (id, attempt, errorCode, minimumDelayMs) =>
      Effect.tryPromise({
        try: async () => {
          const delayMs = Math.max(outboxRetryDelayMs(attempt), minimumDelayMs ?? 0)
          await database
            .update(schema.outbox)
            .set({
              availableAt: new Date(Date.now() + delayMs),
              leaseExpiresAt: null,
              lastError: errorCode.slice(0, 120),
            })
            .where(
              and(
                eq(schema.outbox.id, id),
                isNull(schema.outbox.processedAt),
                isNull(schema.outbox.deadLetteredAt),
              ),
            )
        },
        catch: repositoryError("release"),
      }),
  })
}
