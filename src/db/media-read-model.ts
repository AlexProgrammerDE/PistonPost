import { and, eq, inArray, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import { bannedAccount } from "./account-ban"
import type * as databaseSchema from "./schema"
import { mediaAssets, postMedia, posts, profiles } from "./schema"

type ReadDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

export function ownedMediaStatusQuery(
  database: ReadDatabase,
  ownerId: string,
  mediaIds: readonly string[],
) {
  return database
    .select({ id: mediaAssets.id, status: mediaAssets.status })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.ownerId, ownerId),
        // One JSON parameter keeps large galleries within D1's bound-parameter limit.
        inArray(mediaAssets.id, sql`(select value from json_each(${JSON.stringify(mediaIds)}))`),
      ),
    )
}

/** Reads a ready image with the post or profile that decides who may load it. */
export function imageDeliveryQuery(database: ReadDatabase, mediaId: string) {
  return (
    database
      .select({
        asset: mediaAssets,
        postStatus: posts.status,
        postId: posts.id,
        postAuthorId: posts.authorId,
        visibility: posts.visibility,
        avatarOwnerId: profiles.userId,
        // Post media follows the post author. An avatar follows its profile owner.
        postAuthorBanned: bannedAccount(posts.authorId),
        avatarOwnerBanned: bannedAccount(profiles.userId),
      })
      .from(mediaAssets)
      .leftJoin(postMedia, eq(postMedia.mediaId, mediaAssets.id))
      .leftJoin(posts, eq(posts.id, postMedia.postId))
      .leftJoin(profiles, eq(profiles.avatarMediaId, mediaAssets.id))
      .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.status, "ready")))
      // Edits and uploads attach an image to one post only. If rows ever disagree, use the post
      // that gives the widest access, then the post ID, so the answer never depends on row order.
      .orderBy(
        sql`case
        when ${posts.status} = 'published' and not ${bannedAccount(posts.authorId)}
          then case when ${posts.visibility} = 'public' then 0 else 1 end
        when ${posts.status} = 'published' then 2
        else 3
      end`,
        posts.id,
        profiles.userId,
      )
      .limit(1)
  )
}
