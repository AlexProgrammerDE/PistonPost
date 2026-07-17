import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"

export type AuditMetadata = Readonly<Record<string, string | number | boolean | null>>
export type OutboxPayload = Readonly<Record<string, unknown>>

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
