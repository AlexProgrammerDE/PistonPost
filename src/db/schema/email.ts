import { sql } from "drizzle-orm"
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"
import { outbox } from "./operations"

export const emailCampaigns = sqliteTable(
  "email_campaigns",
  {
    id: text("id").primaryKey(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    preview: text("preview").notNull(),
    heading: text("heading").notNull(),
    message: text("message").notNull(),
    actionLabel: text("action_label"),
    actionUrl: text("action_url"),
    status: text("status", { enum: ["draft", "sending", "sent"] })
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("email_campaigns_status_created_idx").on(table.status, table.createdAt),
    check("email_campaigns_subject_length_check", sql`length(${table.subject}) between 1 and 160`),
    check("email_campaigns_preview_length_check", sql`length(${table.preview}) between 1 and 200`),
    check("email_campaigns_heading_length_check", sql`length(${table.heading}) between 1 and 120`),
    check("email_campaigns_message_length_check", sql`length(${table.message}) between 1 and 2000`),
    check("email_campaigns_status_check", sql`${table.status} in ('draft', 'sending', 'sent')`),
    check(
      "email_campaigns_action_pair_check",
      sql`(${table.actionLabel} is null and ${table.actionUrl} is null) or (${table.actionLabel} is not null and ${table.actionUrl} is not null)`,
    ),
  ],
)

export const emailCampaignDeliveries = sqliteTable(
  "email_campaign_deliveries",
  {
    id: text("id")
      .primaryKey()
      .references(() => outbox.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "sent", "skipped", "dead-lettered"] })
      .notNull()
      .default("queued"),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at").notNull().default(now),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    uniqueIndex("email_campaign_deliveries_campaign_recipient_idx").on(
      table.campaignId,
      table.recipientUserId,
    ),
    index("email_campaign_deliveries_campaign_status_idx").on(table.campaignId, table.status),
    check(
      "email_campaign_deliveries_status_check",
      sql`${table.status} in ('queued', 'sent', 'skipped', 'dead-lettered')`,
    ),
  ],
)
