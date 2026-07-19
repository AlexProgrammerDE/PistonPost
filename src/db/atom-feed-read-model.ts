import { and, desc, eq } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import { searchIndexingTrustCondition } from "@/lib/search-indexing"

import type * as databaseSchema from "./schema"
import { posts, profiles, user } from "./schema"

type ReadDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

export const ATOM_FEED_ITEM_LIMIT = 30

export type PublicAtomFeedRecord = {
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly title: string
  readonly textContent: string | null
  readonly publishedAt: Date
  readonly updatedAt: Date
  readonly author: {
    readonly name: string
    readonly username: string
    readonly normalizedUsername: string
  }
}

export async function listPublicAtomFeedRecords(
  database: ReadDatabase,
): Promise<ReadonlyArray<PublicAtomFeedRecord>> {
  const rows = await database
    .select({
      id: posts.id,
      type: posts.type,
      title: posts.title,
      textContent: posts.textContent,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      authorName: user.name,
      authorUsername: profiles.username,
      authorNormalizedUsername: profiles.normalizedUsername,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(
      and(
        eq(posts.status, "published"),
        eq(posts.visibility, "public"),
        searchIndexingTrustCondition(),
      ),
    )
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(ATOM_FEED_ITEM_LIMIT)

  return rows.flatMap(
    (row): ReadonlyArray<PublicAtomFeedRecord> =>
      row.publishedAt
        ? [
            {
              id: row.id,
              type: row.type,
              title: row.title,
              textContent: row.textContent,
              publishedAt: row.publishedAt,
              updatedAt: row.updatedAt,
              author: {
                name: row.authorName,
                username: row.authorUsername,
                normalizedUsername: row.authorNormalizedUsername,
              },
            },
          ]
        : [],
  )
}
