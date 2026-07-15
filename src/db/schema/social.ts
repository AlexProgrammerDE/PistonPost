import { sql } from "drizzle-orm"
import { check, index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"
import { posts } from "./posts"

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    legacyId: text("legacy_id").unique(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: text("status", { enum: ["published", "moderated", "deleted"] })
      .notNull()
      .default("published"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
    deletedAt: timestamp("deleted_at"),
    moderationReason: text("moderation_reason"),
  },
  (table) => [
    index("comments_post_status_created_idx").on(table.postId, table.status, table.createdAt),
    check("comments_content_length_check", sql`length(${table.content}) between 1 and 250`),
    check("comments_status_check", sql`${table.status} in ('published', 'moderated', 'deleted')`),
  ],
)

export const reactions = sqliteTable(
  "reactions",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["like", "dislike", "heart"] }).notNull(),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId, table.type] }),
    index("reactions_post_type_idx").on(table.postId, table.type),
    check("reactions_type_check", sql`${table.type} in ('like', 'dislike', 'heart')`),
  ],
)
