import { and, eq, inArray, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import type * as databaseSchema from "./schema"
import { mediaAssets } from "./schema"

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
