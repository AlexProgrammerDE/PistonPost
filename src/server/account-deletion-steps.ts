import { eq, inArray, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Context, Effect, Layer, Schema } from "effect"

import * as schema from "@/db/schema"
import { randomUuid } from "@/lib/server-uuid"

import { purgeAccountMedia, type OwnedMediaForDeletion } from "./account-media-purge"
import { FEED_CACHE_TAG, ownerCacheTag, SITEMAP_CACHE_TAG } from "./cache-tags"
import { cacheInvalidationTagsJob, type InternalJob } from "./jobs"
import { bindingOperation, type OperationError } from "./operation"

export type AccountDeletionParams = { userId: string; mediaIds: string[] }

/** The parts of the `ACCOUNT_DELETION` Workflow binding that starting a deletion uses. */
export type AccountDeletionWorkflowBinding = {
  readonly create: (options: { id: string; params: AccountDeletionParams }) => Promise<unknown>
  readonly get: (id: string) => Promise<{ status: () => Promise<{ status: string }> }>
}

/**
 * Starts the purge for one deletion attempt. The first attempt uses a stable instance ID, so a
 * repeated request while it still runs does not start a second purge. An instance that stopped
 * keeps its original media snapshot, and a restart would reuse that payload. Uploads made after
 * that attempt would then lose their owner on deletion and never be purged, so a later attempt
 * starts a new instance with the current media.
 */
export const startAccountDeletion = Effect.fn("AccountDeletion.start")(function* (
  workflow: AccountDeletionWorkflowBinding,
  params: AccountDeletionParams,
) {
  const id = `account-delete-${params.userId}`
  // get() throws for an unknown instance, so create directly and treat a duplicate ID as an
  // earlier deletion request for the same account.
  const created = yield* bindingOperation("account-deletion.create", async () => {
    try {
      await workflow.create({ id, params })
      return true
    } catch (error) {
      if (!(error instanceof Error) || !/already.?exists/iu.test(error.message)) throw error
      return false
    }
  })
  if (created) return id
  const { status } = yield* bindingOperation("account-deletion.status", async () =>
    (await workflow.get(id)).status(),
  )
  if (status !== "errored" && status !== "terminated") return id
  const retryId = `${id}-${yield* randomUuid}`
  yield* bindingOperation("account-deletion.create", () => workflow.create({ id: retryId, params }))
  return retryId
})

class AccountDeletionIncomplete extends Schema.TaggedError<
  AccountDeletionIncomplete,
  { readonly brand: unique symbol }
>()("AccountDeletionIncomplete", {}) {
  override readonly message = "Owned media still requires deletion."
}

class AccountStillExists extends Schema.TaggedError<
  AccountStillExists,
  { readonly brand: unique symbol }
>()("AccountStillExists", {}) {
  override readonly message = "The account row has not been deleted yet."
}

class AccountDeletionStore extends Context.Service<
  AccountDeletionStore,
  {
    readonly accountExists: (userId: string) => Effect.Effect<boolean, OperationError>
    readonly media: (ids: string[]) => Effect.Effect<OwnedMediaForDeletion[], OperationError>
    readonly scheduleCachePurge: (job: InternalJob) => Effect.Effect<void, OperationError>
    readonly complete: (input: AccountDeletionParams) => Effect.Effect<void, OperationError>
  }
>()("pistonpost/server/account-deletion-steps/AccountDeletionStore") {}

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
                  sql`(select value from json_each(${Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))(ids)}))`,
                ),
              ),
          ),
    scheduleCachePurge: (job) =>
      bindingOperation("account-deletion.cache-purge", () => send(job)).pipe(Effect.asVoid),
    complete: (input) =>
      randomUuid.pipe(
        Effect.flatMap((id) =>
          bindingOperation("account-deletion.audit", () =>
            database.insert(schema.auditEvents).values({
              id,
              actorId: null,
              action: "account.deletion-complete",
              entityType: "user",
              entityId: input.userId,
              metadata: { mediaCount: input.mediaIds.length },
            }),
          ),
        ),
        Effect.asVoid,
      ),
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
  if (yield* store.accountExists(input.userId)) return yield* AccountStillExists.make({})
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
  if (remaining.length > 0) return yield* AccountDeletionIncomplete.make({})
  yield* store.complete(input)
  return { complete: true }
})
