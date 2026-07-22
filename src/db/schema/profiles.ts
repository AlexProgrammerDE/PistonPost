import { sql } from "drizzle-orm"
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"

export const profiles = sqliteTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    normalizedUsername: text("normalized_username").notNull(),
    bio: text("bio"),
    website: text("website"),
    location: text("location"),
    avatarMediaId: text("avatar_media_id"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("profiles_normalized_username_idx").on(table.normalizedUsername),
    check("profiles_username_length_check", sql`length(${table.username}) between 1 and 32`),
    check(
      "profiles_normalized_username_length_check",
      sql`length(${table.normalizedUsername}) between 1 and 32`,
    ),
  ],
)

export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    commentNotifications: integer("comment_notifications", { mode: "boolean" })
      .notNull()
      .default(true),
    replyNotifications: integer("reply_notifications", { mode: "boolean" }).notNull().default(true),
    productNotifications: integer("product_notifications", { mode: "boolean" })
      .notNull()
      .default(false),
    commentPushNotifications: integer("comment_push_notifications", { mode: "boolean" })
      .notNull()
      .default(true),
    replyPushNotifications: integer("reply_push_notifications", { mode: "boolean" })
      .notNull()
      .default(true),
    theme: text("theme", { enum: ["system", "light", "dark"] })
      .notNull()
      .default("system"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
  },
  (table) => [
    check("user_settings_theme_check", sql`${table.theme} in ('system', 'light', 'dark')`),
  ],
)
