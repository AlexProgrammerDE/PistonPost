import { and, eq } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Effect } from "effect"

import { RepositoryError } from "@/domain"

import * as schema from "./schema"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

function repositoryError(operation: string, cause: unknown) {
  return new RepositoryError({
    operation,
    message: cause instanceof Error ? cause.message : "The database operation failed.",
  })
}

export function createFollowRepository(database: Database) {
  return {
    findUserFollow: Effect.fn("FollowRepository.findUserFollow")(function* (
      viewerId: string,
      normalizedUsername: string,
    ) {
      return yield* Effect.tryPromise({
        try: async () => {
          const row = await database
            .select({
              targetId: schema.profiles.userId,
              followedId: schema.userFollows.followedUserId,
            })
            .from(schema.profiles)
            .leftJoin(
              schema.userFollows,
              and(
                eq(schema.userFollows.followedUserId, schema.profiles.userId),
                eq(schema.userFollows.followerId, viewerId),
              ),
            )
            .where(eq(schema.profiles.normalizedUsername, normalizedUsername))
            .get()

          return row ? { targetId: row.targetId, following: row.followedId !== null } : null
        },
        catch: (cause) => repositoryError("follow.findUser", cause),
      })
    }),
    findTagFollow: Effect.fn("FollowRepository.findTagFollow")(function* (
      viewerId: string,
      normalizedTag: string,
    ) {
      return yield* Effect.tryPromise({
        try: async () => {
          const row = await database
            .select({ targetId: schema.tags.id, followedId: schema.tagFollows.tagId })
            .from(schema.tags)
            .leftJoin(
              schema.tagFollows,
              and(
                eq(schema.tagFollows.tagId, schema.tags.id),
                eq(schema.tagFollows.userId, viewerId),
              ),
            )
            .where(eq(schema.tags.normalizedName, normalizedTag))
            .get()

          return row ? { targetId: row.targetId, following: row.followedId !== null } : null
        },
        catch: (cause) => repositoryError("follow.findTag", cause),
      })
    }),
    setUserFollow: Effect.fn("FollowRepository.setUserFollow")(function* (
      viewerId: string,
      targetUserId: string,
      following: boolean,
    ) {
      yield* Effect.tryPromise({
        try: async () => {
          if (following) {
            await database
              .insert(schema.userFollows)
              .values({ followerId: viewerId, followedUserId: targetUserId })
              .onConflictDoNothing()
          } else {
            await database
              .delete(schema.userFollows)
              .where(
                and(
                  eq(schema.userFollows.followerId, viewerId),
                  eq(schema.userFollows.followedUserId, targetUserId),
                ),
              )
          }
        },
        catch: (cause) => repositoryError("follow.setUser", cause),
      })
    }),
    setTagFollow: Effect.fn("FollowRepository.setTagFollow")(function* (
      viewerId: string,
      tagId: string,
      following: boolean,
    ) {
      yield* Effect.tryPromise({
        try: async () => {
          if (following) {
            await database
              .insert(schema.tagFollows)
              .values({ userId: viewerId, tagId })
              .onConflictDoNothing()
          } else {
            await database
              .delete(schema.tagFollows)
              .where(
                and(eq(schema.tagFollows.userId, viewerId), eq(schema.tagFollows.tagId, tagId)),
              )
          }
        },
        catch: (cause) => repositoryError("follow.setTag", cause),
      })
    }),
  }
}
