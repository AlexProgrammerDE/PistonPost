import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"

import type { D1DatabaseClient, SqliteDatabaseClient } from "@/db"
import * as schema from "@/db/schema"
import { parseManagedAvatarMediaId } from "@/lib/media-image"

export async function isManagedUserAvatar(
  database: D1DatabaseClient | SqliteDatabaseClient,
  userId: string,
  image: string,
) {
  const mediaId = parseManagedAvatarMediaId(image)
  if (!mediaId) return false

  const avatar = await database.query.mediaAssets.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.mediaAssets.id, mediaId),
      eq(schema.mediaAssets.ownerId, userId),
      eq(schema.mediaAssets.kind, "avatar"),
      eq(schema.mediaAssets.provider, "r2"),
      eq(schema.mediaAssets.status, "ready"),
      isNotNull(schema.mediaAssets.r2Key),
      isNull(schema.mediaAssets.deletedAt),
      sql`exists (
        select 1
        from ${schema.profiles}
        where user_id = ${userId}
          and avatar_media_id = ${mediaId}
      )`,
    ),
  })

  return avatar !== undefined
}
