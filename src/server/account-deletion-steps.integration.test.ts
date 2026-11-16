import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { createMigratedTestDatabase, createPost, createUser, schema } from "@/db"

import {
  accountDeletionStoreLayer,
  confirmAccountDeleted,
  deleteOwnedAccountMedia,
  scheduleAccountCachePurge,
  verifyAccountPurge,
} from "./account-deletion-steps"
import { accountMediaPurgeLayer } from "./account-media-purge"
import type { InternalJob } from "./jobs"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})
function setup() {
  const db = createMigratedTestDatabase()
  databases.push(db)
  db.insert(schema.user).values(createUser()).run()
  db.insert(schema.mediaAssets)
    .values({
      id: "asset",
      ownerId: "test-user",
      kind: "image",
      provider: "r2",
      status: "ready",
      r2Key: "image",
      streamUid: "video",
      originalFilename: "image.png",
      mimeType: "image/png",
      byteSize: 128,
    })
    .run()
  const queued: InternalJob[] = []
  const store = accountDeletionStoreLayer(db, async (job) => {
    queued.push(job)
  })
  const input = { userId: "test-user", mediaIds: ["asset"] }
  return { db, store, queued, input }
}

describe("native account deletion steps", () => {
  test("keeps unfinished provider cleanup resumable and records completion after deletion", async () => {
    const { db, store, input } = setup()
    let fail = true
    const providers: string[] = []
    const layer = Layer.merge(
      store,
      accountMediaPurgeLayer({
        deleteR2: async () => {
          providers.push("r2")
        },
        deleteStream: async () => {
          providers.push("stream")
          if (fail) throw new Error("unavailable")
        },
        deleteRecord: async (id) => {
          db.delete(schema.mediaAssets).where(eq(schema.mediaAssets.id, id)).run()
        },
      }),
    )
    expect(
      Effect.runPromise(deleteOwnedAccountMedia(input).pipe(Effect.provide(layer))),
    ).rejects.toMatchObject({ assetId: "asset", operation: "stream" })
    expect(db.select().from(schema.mediaAssets).all()).toHaveLength(1)
    expect(
      Effect.runPromise(verifyAccountPurge(input).pipe(Effect.provide(store))),
    ).rejects.toMatchObject({ _tag: "AccountDeletionIncomplete" })
    expect(db.select().from(schema.auditEvents).all()).toHaveLength(0)
    fail = false
    expect(
      await Effect.runPromise(deleteOwnedAccountMedia(input).pipe(Effect.provide(layer))),
    ).toEqual({ deleted: 1 })
    expect(providers).toEqual(["r2", "stream", "r2", "stream"])
    expect(await Effect.runPromise(verifyAccountPurge(input).pipe(Effect.provide(store)))).toEqual({
      complete: true,
    })
    expect(db.select().from(schema.auditEvents).get()).toMatchObject({
      action: "account.deletion-complete",
      entityId: "test-user",
      metadata: { mediaCount: 1 },
    })
    expect(
      await Effect.runPromise(deleteOwnedAccountMedia(input).pipe(Effect.provide(layer))),
    ).toEqual({ deleted: 0 })
  })

  test("retains the cache job's stable replay identity and count", async () => {
    const { store, queued, input } = setup()
    expect(
      await Effect.runPromise(scheduleAccountCachePurge(input).pipe(Effect.provide(store))),
    ).toEqual({ scheduled: 1 })
    expect(queued).toEqual([
      {
        type: "cache.invalidate",
        idempotencyKey: "cache.invalidate:account:test-user",
        tags: ["pistonpost-owner-test-user", "pistonpost-feed", "pistonpost-sitemap"],
      },
    ])
  })

  test("purges and verifies more owned media than D1 allows as bound parameters", async () => {
    const { db, store } = setup()
    const mediaIds = Array.from({ length: 150 }, (_, index) => `bulk-${index.toString()}`)
    for (const id of mediaIds)
      db.insert(schema.mediaAssets)
        .values({
          id,
          ownerId: "test-user",
          kind: "image",
          provider: "r2",
          status: "ready",
          r2Key: id,
          originalFilename: `${id}.png`,
          mimeType: "image/png",
          byteSize: 128,
        })
        .run()
    const input = { userId: "test-user", mediaIds }
    // D1 rejects statements with more than 100 bound parameters. Bun's SQLite allows more.
    const prepare = db.$client.prepare.bind(db.$client)
    db.$client.prepare = (query: string) => {
      if ((query.match(/\?/g)?.length ?? 0) > 100) throw new Error("too many SQL variables")
      return prepare(query)
    }
    const layer = Layer.merge(
      store,
      accountMediaPurgeLayer({
        deleteR2: async () => undefined,
        deleteStream: async () => undefined,
        deleteRecord: async (id) => {
          db.delete(schema.mediaAssets).where(eq(schema.mediaAssets.id, id)).run()
        },
      }),
    )
    expect(
      await Effect.runPromise(deleteOwnedAccountMedia(input).pipe(Effect.provide(layer))),
    ).toEqual({ deleted: 150 })
    expect(await Effect.runPromise(verifyAccountPurge(input).pipe(Effect.provide(store)))).toEqual({
      complete: true,
    })
    expect(
      db
        .select()
        .from(schema.mediaAssets)
        .all()
        .map(({ id }) => id),
    ).toEqual(["asset"])
  })

  test("deletes an account whose comment has replies and waits for the row to go", async () => {
    const { db, store, input } = setup()
    db.insert(schema.user)
      .values(createUser({ id: "replier", email: "replier@example.com" }))
      .run()
    const post = createPost({ authorId: "replier" })
    db.insert(schema.posts).values(post).run()
    db.insert(schema.comments)
      .values([
        { id: "parent", postId: post.id, authorId: "test-user", content: "First" },
        {
          id: "reply",
          postId: post.id,
          authorId: "replier",
          parentId: "parent",
          content: "Reply",
        },
      ])
      .run()

    expect(
      Effect.runPromise(confirmAccountDeleted(input).pipe(Effect.provide(store))),
    ).rejects.toMatchObject({ _tag: "AccountStillExists" })
    db.delete(schema.user).where(eq(schema.user.id, "test-user")).run()

    expect(db.select().from(schema.comments).all()).toEqual([
      expect.objectContaining({ id: "reply", parentId: null, content: "Reply" }),
    ])
    expect(
      await Effect.runPromise(confirmAccountDeleted(input).pipe(Effect.provide(store))),
    ).toEqual({ deleted: true })
    expect(
      db.select({ ownerId: schema.mediaAssets.ownerId }).from(schema.mediaAssets).get(),
    ).toEqual({ ownerId: null })
  })
})
