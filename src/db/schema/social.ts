import { sql } from "drizzle-orm"
import {
  type AnySQLiteColumn,
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"
import { posts, tags } from "./posts"

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
    parentId: text("parent_id").references((): AnySQLiteColumn => comments.id),
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
    index("comments_parent_status_created_idx").on(table.parentId, table.status, table.createdAt),
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

export const userFollows = sqliteTable(
  "user_follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followedUserId: text("followed_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followedUserId] }),
    index("user_follows_followed_user_idx").on(table.followedUserId, table.followerId),
    check("user_follows_not_self_check", sql`${table.followerId} <> ${table.followedUserId}`),
  ],
)

export const tagFollows = sqliteTable(
  "tag_follows",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tagId] }),
    index("tag_follows_tag_idx").on(table.tagId, table.userId),
  ],
)
