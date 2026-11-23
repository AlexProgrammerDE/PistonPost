import { and, eq, isNotNull, lt, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { DateTime } from "effect"

import * as schema from "@/db/schema"
import type { AuditMetadata } from "@/db/schema"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

export const EMAIL_CHANGE_AUDIT_ACTION = "auth.email-change-requested"

/**
 * Better Auth replaces the address before the security email job runs, so the email-change
 * audit event keeps the previous address for the warning sent to it. Maintenance removes it after
 * this window, which covers Queue retries and a manual dead-letter replay.
 */
export const PREVIOUS_EMAIL_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

export function emailChangeAuditMetadata(previousEmail: string): AuditMetadata {
  return { previousEmail }
}

export function previousEmailFrom(metadata: AuditMetadata): string | undefined {
  const value = metadata["previousEmail"]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** Removes previous addresses from email-change audit events older than the retention window. */
export function redactExpiredPreviousEmails(database: Database, now: number) {
  return database
    .update(schema.auditEvents)
    .set({ metadata: sql`json_remove(${schema.auditEvents.metadata}, '$.previousEmail')` })
    .where(
      and(
        eq(schema.auditEvents.action, EMAIL_CHANGE_AUDIT_ACTION),
        lt(
          schema.auditEvents.createdAt,
          DateTime.toDateUtc(DateTime.makeUnsafe(now - PREVIOUS_EMAIL_RETENTION_MS)),
        ),
        isNotNull(sql`json_extract(${schema.auditEvents.metadata}, '$.previousEmail')`),
      ),
    )
}
