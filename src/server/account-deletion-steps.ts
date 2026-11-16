import { eq, inArray, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Context, Data, Effect, Layer } from "effect"

import * as schema from "@/db/schema"

import { purgeAccountMedia, type OwnedMediaForDeletion } from "./account-media-purge"
import { FEED_CACHE_TAG, ownerCacheTag, SITEMAP_CACHE_TAG } from "./cache-tags"
import { cacheInvalidationTagsJob, type InternalJob } from "./jobs"
import { bindingOperation, type OperationError } from "./operation"

export type AccountDeletionParams = { userId: string; mediaIds: string[] }

class AccountDeletionIncomplete extends Data.TaggedError("AccountDeletionIncomplete") {
  readonly message = "Owned media still requires deletion."
}

class AccountStillExists extends Data.TaggedError("AccountStillExists") {
  readonly message = "The account row has not been deleted yet."
}

class AccountDeletionStore extends Context.Service<
  AccountDeletionStore,
  {
    readonly accountExists: (userId: string) => Effect.Effect<boolean, OperationError>
    readonly media: (ids: string[]) => Effect.Effect<OwnedMediaForDeletion[], OperationError>
    readonly scheduleCachePurge: (job: InternalJob) => Effect.Effect<void, OperationError>
    readonly complete: (input: AccountDeletionParams) => Effect.Effect<void, OperationError>
  }
>()("@pistonpost/media/AccountDeletionStore") {}

export function accountDeletionStoreLayer(
  database: BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>,
  send: (job: InternalJob) => Promise<unknown>,
) {
  return Layer.succeed(AccountDeletionStore, {
    accountExists: (userId) =>
      bindingOperation("account-deletion.account", () =>
        database
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .get(),
      ).pipe(Effect.map((row) => row !== undefined)),
    media: (ids) =>
      ids.length === 0
        ? Effect.succeed([])
        : bindingOperation("account-deletion.media", () =>
            database
              .select({
                id: schema.mediaAssets.id,
                r2Key: schema.mediaAssets.r2Key,
                streamUid: schema.mediaAssets.streamUid,
              })
              .from(schema.mediaAssets)
              .where(
                // One JSON parameter keeps large accounts within D1's bound-parameter limit.
                inArray(
                  schema.mediaAssets.id,
                  sql`(select value from json_each(${JSON.stringify(ids)}))`,
                ),
              ),
          ),
    scheduleCachePurge: (job) =>
      bindingOperation("account-deletion.cache-purge", () => send(job)).pipe(Effect.asVoid),
    complete: (input) =>
      bindingOperation("account-deletion.audit", () =>
        database.insert(schema.auditEvents).values({
          id: crypto.randomUUID(),
          actorId: null,
          action: "account.deletion-complete",
          entityType: "user",
          entityId: input.userId,
          metadata: { mediaCount: input.mediaIds.length },
        }),
      ).pipe(Effect.asVoid),
  })
}

/**
 * The workflow starts before Better Auth deletes the user row. Purging media only after the
 * row is gone keeps an account whose deletion failed from losing its uploads.
 */
export const confirmAccountDeleted = Effect.fn("AccountDeletion.confirmAccountDeleted")(function* (
  input: AccountDeletionParams,
) {
  const store = yield* AccountDeletionStore
  if (yield* store.accountExists(input.userId)) return yield* new AccountStillExists()
  return { deleted: true }
})

export const deleteOwnedAccountMedia = Effect.fn("AccountDeletion.deleteOwnedMedia")(function* (
  input: AccountDeletionParams,
) {
  if (input.mediaIds.length === 0) return { deleted: 0 }
  const store = yield* AccountDeletionStore
  const assets = yield* store.media(input.mediaIds)
  yield* purgeAccountMedia(assets)
  return { deleted: assets.length }
})

export const scheduleAccountCachePurge = Effect.fn("AccountDeletion.scheduleCachePurge")(function* (
  input: AccountDeletionParams,
) {
  const store = yield* AccountDeletionStore
  yield* store.scheduleCachePurge(
    cacheInvalidationTagsJob(
      `account:${input.userId}`,
      [ownerCacheTag(input.userId), FEED_CACHE_TAG, SITEMAP_CACHE_TAG],
      `cache.invalidate:account:${input.userId}`,
    ),
  )
  return { scheduled: input.mediaIds.length }
})

export const verifyAccountPurge = Effect.fn("AccountDeletion.verifyPurge")(function* (
  input: AccountDeletionParams,
) {
  const store = yield* AccountDeletionStore
  const remaining = yield* store.media(input.mediaIds)
  if (remaining.length > 0) return yield* new AccountDeletionIncomplete()
  yield* store.complete(input)
  return { complete: true }
})
