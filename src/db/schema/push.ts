import { sql } from "drizzle-orm"
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { session, user } from "./auth.generated"
import { now, timestamp } from "./common"

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    endpointHash: text("endpoint_hash").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    expirationTime: timestamp("expiration_time"),
    lastSuccessAt: timestamp("last_success_at"),
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_hash_idx").on(table.endpointHash),
    index("push_subscriptions_user_active_idx").on(table.userId, table.disabledAt),
    index("push_subscriptions_session_idx").on(table.sessionId),
    check(
      "push_subscriptions_endpoint_length_check",
      sql`length(${table.endpoint}) between 1 and 2048`,
    ),
    check("push_subscriptions_endpoint_hash_length_check", sql`length(${table.endpointHash}) = 64`),
    check("push_subscriptions_p256dh_length_check", sql`length(${table.p256dh}) between 1 and 512`),
    check("push_subscriptions_auth_length_check", sql`length(${table.auth}) between 1 and 256`),
  ],
)
