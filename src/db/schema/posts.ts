import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { user } from "./auth.generated"
import { now, timestamp } from "./common"

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    legacyId: text("legacy_id"),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["text", "images", "video"] }).notNull(),
    status: text("status", {
      enum: ["draft", "processing", "published", "moderated", "deleted", "failed"],
    })
      .notNull()
      .default("draft"),
    visibility: text("visibility", { enum: ["public", "unlisted"] })
      .notNull()
      .default("public"),
    title: text("title").notNull(),
    textContent: text("text_content"),
    createdAt: timestamp("created_at").notNull().default(now),
    updatedAt: timestamp("updated_at").notNull().default(now),
    publishedAt: timestamp("published_at"),
    deletedAt: timestamp("deleted_at"),
    moderationReason: text("moderation_reason"),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("posts_legacy_id_idx").on(table.legacyId),
    index("posts_discovery_idx").on(table.status, table.visibility, table.publishedAt, table.id),
    index("posts_author_status_created_idx").on(table.authorId, table.status, table.createdAt),
    check("posts_type_check", sql`${table.type} in ('text', 'images', 'video')`),
    check(
      "posts_status_check",
      sql`${table.status} in ('draft', 'processing', 'published', 'moderated', 'deleted', 'failed')`,
    ),
    check("posts_visibility_check", sql`${table.visibility} in ('public', 'unlisted')`),
    check("posts_title_length_check", sql`length(${table.title}) between 1 and 10000`),
    check(
      "posts_text_content_length_check",
      sql`${table.textContent} is null or length(${table.textContent}) <= 1000000`,
    ),
    check(
      "posts_text_content_required_check",
      sql`${table.type} <> 'text' or ${table.textContent} is not null`,
    ),
    check(
      "posts_published_at_check",
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
    check("posts_version_check", sql`${table.version} > 0`),
  ],
)

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull().unique(),
    createdAt: timestamp("created_at").notNull().default(now),
  },
  (table) => [
    check("tags_display_name_check", sql`length(${table.displayName}) between 1 and 64`),
    check("tags_normalized_name_check", sql`length(${table.normalizedName}) between 1 and 64`),
  ],
)

export const postTags = sqliteTable(
  "post_tags",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.tagId] }),
    uniqueIndex("post_tags_post_ordinal_idx").on(table.postId, table.ordinal),
    index("post_tags_tag_post_idx").on(table.tagId, table.postId),
    check("post_tags_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
)
