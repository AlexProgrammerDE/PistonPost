import { sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import type * as databaseSchema from "./schema"
import { postViewCounts } from "./schema"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

export async function incrementPostViewCount(database: Database, postId: string) {
  const rows = await database
    .insert(postViewCounts)
    .values({ postId, viewCount: 1 })
    .onConflictDoUpdate({
      target: postViewCounts.postId,
      set: { viewCount: sql`${postViewCounts.viewCount} + 1` },
    })
    .returning({ viewCount: postViewCounts.viewCount })

  return rows[0]?.viewCount ?? null
}
