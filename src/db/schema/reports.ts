import { sql } from "drizzle-orm"
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"

export const contentReports = sqliteTable(
  "content_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    targetType: text("target_type", { enum: ["post", "comment", "profile"] }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason", {
      enum: ["spam", "harassment", "illegal", "copyright", "other"],
    }).notNull(),
    details: text("details"),
    status: text("status", { enum: ["open", "resolved", "dismissed"] })
      .notNull()
      .default("open"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
  },
  (table) => [
    index("content_reports_status_created_idx").on(table.status, table.createdAt, table.id),
    index("content_reports_target_idx").on(table.targetType, table.targetId, table.createdAt),
    index("content_reports_reporter_created_idx").on(table.reporterId, table.createdAt),
    // Account deletion sets resolved_by to null.
    index("content_reports_resolved_by_idx").on(table.resolvedBy),
    // A reporter can hold one open report per target. Concurrent submissions cannot both insert.
    uniqueIndex("content_reports_open_reporter_target_idx")
      .on(table.reporterId, table.targetType, table.targetId)
      .where(sql`status = 'open'`),
    check(
      "content_reports_target_type_check",
      sql`${table.targetType} in ('post', 'comment', 'profile')`,
    ),
    check(
      "content_reports_reason_check",
      sql`${table.reason} in ('spam', 'harassment', 'illegal', 'copyright', 'other')`,
    ),
    check(
      "content_reports_status_check",
      sql`${table.status} in ('open', 'resolved', 'dismissed')`,
    ),
    check("content_reports_target_id_check", sql`length(${table.targetId}) between 1 and 128`),
    check(
      "content_reports_details_check",
      sql`${table.details} is null or length(${table.details}) <= 1000`,
    ),
  ],
)
