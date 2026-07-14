import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"

export type AuditMetadata = Readonly<Record<string, string | number | boolean | null>>
export type OutboxPayload = Readonly<Record<string, unknown>>
export type MigrationCounters = Readonly<Record<string, number>>

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<AuditMetadata>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().default(now),
  },
  (table) => [
    index("audit_events_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
  ],
)

export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payload: text("payload", { mode: "json" }).$type<OutboxPayload>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at").notNull().default(now),
    processedAt: timestamp("processed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().default(now),
  },
  (table) => [
    index("outbox_processed_available_idx").on(table.processedAt, table.availableAt),
    check("outbox_attempts_check", sql`${table.attempts} >= 0`),
  ],
)

export const migrationRuns = sqliteTable(
  "migration_runs",
  {
    id: text("id").primaryKey(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    state: text("state", { enum: ["analyzing", "running", "failed", "complete"] }).notNull(),
    counters: text("counters", { mode: "json" }).$type<MigrationCounters>().notNull().default({}),
    startedAt: timestamp("started_at").notNull().default(now),
    finishedAt: timestamp("finished_at"),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("migration_runs_source_fingerprint_idx").on(table.sourceFingerprint),
    check(
      "migration_runs_state_check",
      sql`${table.state} in ('analyzing', 'running', 'failed', 'complete')`,
    ),
  ],
)

export const migrationMappings = sqliteTable(
  "migration_mappings",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => migrationRuns.id, { onDelete: "cascade" }),
    sourceCollection: text("source_collection").notNull(),
    legacyId: text("legacy_id").notNull(),
    targetTable: text("target_table").notNull(),
    targetId: text("target_id"),
    checksum: text("checksum"),
    state: text("state", { enum: ["pending", "imported", "skipped", "failed"] }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("migration_mappings_source_legacy_idx").on(table.sourceCollection, table.legacyId),
    index("migration_mappings_run_state_idx").on(table.runId, table.state),
    check(
      "migration_mappings_state_check",
      sql`${table.state} in ('pending', 'imported', 'skipped', 'failed')`,
    ),
  ],
)
