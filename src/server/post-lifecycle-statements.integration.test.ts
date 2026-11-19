import { afterEach, describe, expect, test } from "bun:test"

import { createPost, createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { cacheInvalidationJob } from "./jobs"
import {
  postDeleteStatements,
  postPublishStatements,
  type Statement,
} from "./post-lifecycle-statements"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

function fixture(status: "draft" | "published" = "published") {
  const database = createMigratedTestDatabase()
  databases.push(database)
  database
    .insert(schema.user)
    .values([
      createUser(),
      createUser({ id: "other", email: "other@example.com" }),
      createUser({ id: "admin", email: "admin@example.com", role: "admin" }),
    ])
    .run()
  database
    .insert(schema.posts)
    .values(
      createPost({
        id: "post",
        status,
        publishedAt: status === "published" ? new Date() : null,
      }),
    )
    .run()
  const mediaId = crypto.randomUUID()
  database
    .insert(schema.mediaAssets)
    .values({
      id: mediaId,
      ownerId: "test-user",
      kind: "image",
      provider: "r2",
      status: "ready",
      originalFilename: "cat.png",
      mimeType: "image/png",
      byteSize: 10,
    })
    .run()
  database.insert(schema.postMedia).values({ postId: "post", mediaId, ordinal: 0 }).run()
  database
    .insert(schema.comments)
    .values({ id: crypto.randomUUID(), postId: "post", authorId: "other", content: "Nice" })
    .run()
  database.insert(schema.reactions).values({ postId: "post", userId: "other" }).run()
  return { database, mediaId }
}

function run(database: ReturnType<typeof createMigratedTestDatabase>, statements: Statement[]) {
  return database.$client.transaction(() =>
    statements.map(({ sql, params }) => database.$client.query(sql).run(...params).changes),
  )()
}

function count(database: ReturnType<typeof createMigratedTestDatabase>, sql: string) {
  return database.$client.query<{ count: number }, []>(sql).get()?.count
}

function deletePost(
  database: ReturnType<typeof createMigratedTestDatabase>,
  { actorId = "test-user", version = 1, mediaIds = [] as string[], audit = false } = {},
) {
  return run(
    database,
    postDeleteStatements(
      {
        id: "post",
        version,
        actorId,
        mediaIds,
        audit: audit
          ? {
              id: crypto.randomUUID(),
              actorId,
              action: "post.delete",
              entityType: "post",
              entityId: "post",
              metadata: { authorId: "test-user" },
            }
          : null,
      },
      cacheInvalidationJob("post"),
    ),
  ).at(-1)
}

describe("atomic post deletion", () => {
  test("deletes the post with its comments, hearts, tags, and queued cleanup", () => {
    const { database, mediaId } = fixture()
    expect(deletePost(database, { mediaIds: [mediaId] })).toBe(1)
    expect(
      database.$client.query("select status, version from posts where id = 'post'").get(),
    ).toEqual({ status: "deleted", version: 2 })
    expect(count(database, "select count(*) as count from comments")).toBe(0)
    expect(count(database, "select count(*) as count from reactions")).toBe(0)
    expect(
      database.$client
        .query("select kind, payload from outbox where id = ?")
        .get(`media.cleanup:${mediaId}`),
    ).toEqual({
      kind: "media.cleanup",
      payload: JSON.stringify({
        type: "media.cleanup",
        idempotencyKey: `media.cleanup:${mediaId}`,
        mediaId,
      }),
    })
    expect(
      count(database, "select count(*) as count from outbox where kind = 'cache.invalidate'"),
    ).toBe(1)
    expect(count(database, "select count(*) as count from audit_events")).toBe(0)
  })

  test("records an audit event when an admin deletes another user's post", () => {
    const { database } = fixture()
    expect(deletePost(database, { actorId: "admin", audit: true })).toBe(1)
    expect(
      database.$client
        .query("select actor_id, action, entity_type, entity_id, metadata from audit_events")
        .get(),
    ).toEqual({
      actor_id: "admin",
      action: "post.delete",
      entity_type: "post",
      entity_id: "post",
      metadata: JSON.stringify({ authorId: "test-user" }),
    })
  })

  for (const [name, options] of [
    ["a stale version", { version: 2 }],
    ["another user", { actorId: "other", audit: true }],
  ] as const) {
    test(`rejects ${name} without partial changes`, () => {
      const { database, mediaId } = fixture()
      const before = database.$client.serialize()
      expect(deletePost(database, { ...options, mediaIds: [mediaId] })).toBe(0)
      expect(database.$client.serialize()).toEqual(before)
    })
  }

  test("a second delete of the same version changes nothing", () => {
    const { database, mediaId } = fixture()
    expect(deletePost(database, { mediaIds: [mediaId] })).toBe(1)
    const before = database.$client.serialize()
    expect(deletePost(database, { mediaIds: [mediaId] })).toBe(0)
    expect(database.$client.serialize()).toEqual(before)
  })
})

function publish(
  database: ReturnType<typeof createMigratedTestDatabase>,
  { authorId = "test-user", version = 1 } = {},
) {
  return run(
    database,
    postPublishStatements({ id: "post", version, authorId }, cacheInvalidationJob("post")),
  ).at(-1)
}

describe("atomic post publishing", () => {
  test("publishes the draft and queues cache invalidation together", () => {
    const { database } = fixture("draft")
    expect(publish(database)).toBe(1)
    const post = database.$client
      .query<{ status: string; version: number; published_at: number | null }, []>(
        "select status, version, published_at from posts where id = 'post'",
      )
      .get()
    expect(post?.status).toBe("published")
    expect(post?.version).toBe(2)
    expect(post?.published_at).toBeNumber()
    expect(
      count(database, "select count(*) as count from outbox where kind = 'cache.invalidate'"),
    ).toBe(1)
  })

  for (const [name, setup, options] of [
    ["a stale version", "draft", { version: 2 }],
    ["another author", "draft", { authorId: "other" }],
    ["a published post", "published", {}],
  ] as const) {
    test(`rejects ${name} without queueing invalidation`, () => {
      const { database } = fixture(setup)
      const before = database.$client.serialize()
      expect(publish(database, options)).toBe(0)
      expect(database.$client.serialize()).toEqual(before)
    })
  }
})
