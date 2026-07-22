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
import { posts } from "./posts"

export type MediaProviderMetadata = Readonly<Record<string, string | number | boolean | null>>

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["image", "video", "avatar"] }).notNull(),
    provider: text("provider", { enum: ["r2", "images", "stream"] }).notNull(),
    status: text("status", {
      enum: ["pending", "uploading", "processing", "ready", "failed", "deleted"],
    })
      .notNull()
      .default("pending"),
    r2Key: text("r2_key").unique(),
    streamUid: text("stream_uid").unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration_ms"),
    checksum: text("checksum"),
    altText: text("alt_text"),
    providerMetadata: text("provider_metadata", { mode: "json" })
      .$type<MediaProviderMetadata>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().default(now),
    finalizedAt: timestamp("finalized_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("media_assets_owner_status_created_idx").on(table.ownerId, table.status, table.createdAt),
    check("media_assets_kind_check", sql`${table.kind} in ('image', 'video', 'avatar')`),
    check("media_assets_provider_check", sql`${table.provider} in ('r2', 'images', 'stream')`),
    check(
      "media_assets_status_check",
      sql`${table.status} in ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted')`,
    ),
    check("media_assets_byte_size_check", sql`${table.byteSize} >= 0`),
    check("media_assets_width_check", sql`${table.width} is null or ${table.width} > 0`),
    check("media_assets_height_check", sql`${table.height} is null or ${table.height} > 0`),
    check("media_assets_duration_check", sql`${table.duration} is null or ${table.duration} >= 0`),
  ],
)

export const postMedia = sqliteTable(
  "post_media",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    caption: text("caption"),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.mediaId] }),
    uniqueIndex("post_media_post_ordinal_idx").on(table.postId, table.ordinal),
    check("post_media_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
)
