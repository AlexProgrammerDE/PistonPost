import { and, desc, eq, lt, or } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Effect } from "effect"

import { RepositoryError, type PostRepositoryService } from "@/domain"

import * as schema from "./schema"
import { posts } from "./schema"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

const postColumns = {
  id: posts.id,
  authorId: posts.authorId,
  type: posts.type,
  status: posts.status,
  visibility: posts.visibility,
  title: posts.title,
  textContent: posts.textContent,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
  publishedAt: posts.publishedAt,
  deletedAt: posts.deletedAt,
  moderationReason: posts.moderationReason,
  version: posts.version,
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
          const rows = await database
            .select(postColumns)
            .from(posts)
            .where(eq(posts.id, id))
            .limit(1)
          return rows[0] ?? null
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
            .select(postColumns)
            .from(posts)
            .where(and(eq(posts.status, "published"), eq(posts.visibility, "public"), cursorFilter))
            .orderBy(desc(posts.publishedAt), desc(posts.id))
            .limit(Math.min(Math.max(limit, 1), 100))
          return rows
        },
        catch: (cause) => repositoryError("post.listPublic", cause),
      }),
  }
}
