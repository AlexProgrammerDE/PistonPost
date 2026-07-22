import { and, desc, eq, lt, or } from "drizzle-orm"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import { Effect } from "effect"

import { type Post, RepositoryError, type PostRepositoryService } from "@/domain"

import * as schema from "./schema"
import { posts } from "./schema"

type Database = BunSQLiteDatabase<typeof schema> | DrizzleD1Database<typeof schema>

function toPost(row: typeof posts.$inferSelect): Post {
  return {
    id: row.id,
    authorId: row.authorId,
    type: row.type,
    status: row.status,
    visibility: row.visibility,
    title: row.title,
    textContent: row.textContent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    deletedAt: row.deletedAt,
    moderationReason: row.moderationReason,
    version: row.version,
  }
}

function repositoryError(operation: string, cause: unknown) {
  return new RepositoryError({
    operation,
    message: cause instanceof Error ? cause.message : "The database operation failed.",
  })
}

export function createPostRepository(database: Database): PostRepositoryService {
  return {
    findById: (id) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await database.select().from(posts).where(eq(posts.id, id)).limit(1)
          const row = rows[0]
          return row ? toPost(row) : null
        },
        catch: (cause) => repositoryError("post.findById", cause),
      }),
    insert: (post) =>
      Effect.tryPromise({
        try: async () => {
          await database.insert(posts).values(post)
        },
        catch: (cause) => repositoryError("post.insert", cause),
      }),
    listPublic: ({ cursor, limit }) =>
      Effect.tryPromise({
        try: async () => {
          const cursorFilter = cursor
            ? or(
                lt(posts.publishedAt, cursor.publishedAt),
                and(eq(posts.publishedAt, cursor.publishedAt), lt(posts.id, cursor.id)),
              )
            : undefined

          const rows = await database
            .select()
            .from(posts)
            .where(and(eq(posts.status, "published"), eq(posts.visibility, "public"), cursorFilter))
            .orderBy(desc(posts.publishedAt), desc(posts.id))
            .limit(Math.min(Math.max(limit, 1), 100))
          return rows.map(toPost)
        },
        catch: (cause) => repositoryError("post.listPublic", cause),
      }),
  }
}
