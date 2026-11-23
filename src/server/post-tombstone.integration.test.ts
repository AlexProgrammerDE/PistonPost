import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"

import { createPost, createUser } from "@/db/factories"
import { getPublishedPostRead } from "@/db/public-read-model"
import { auditEvents, posts, profiles, user } from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { findModeratedPostTombstone } from "./post-tombstone"
import { requestActor } from "./request-session"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

const now = new Date("2026-11-20T12:00:00.000Z")
const publishedAt = new Date("2026-11-01T00:00:00.000Z")

function seedDatabase() {
  const database = createMigratedTestDatabase()
  close = () => {
    database.$client.close()
  }
  database
    .insert(user)
    .values([
      createUser({ id: "owner", email: "owner@example.com", name: "Owner" }),
      createUser({ id: "other", email: "other@example.com", name: "Other" }),
      createUser({ id: "admin", email: "admin@example.com", name: "Admin", role: "admin" }),
    ])
    .run()
  database
    .insert(profiles)
    .values([
      { userId: "owner", username: "Owner", normalizedUsername: "owner" },
      { userId: "other", username: "other", normalizedUsername: "other" },
      { userId: "admin", username: "admin", normalizedUsername: "admin" },
    ])
    .run()
  database
    .insert(posts)
    .values([
      createPost({ id: "public", authorId: "owner", status: "published", publishedAt }),
      createPost({
        id: "unlisted",
        authorId: "owner",
        status: "published",
        visibility: "unlisted",
        publishedAt,
      }),
      createPost({ id: "draft", authorId: "owner", status: "draft" }),
      createPost({
        id: "deleted",
        authorId: "owner",
        status: "deleted",
        publishedAt,
        deletedAt: publishedAt,
      }),
      createPost({
        id: "moderated",
        authorId: "owner",
        type: "images",
        title: "Weekend dump",
        status: "moderated",
        publishedAt,
        moderationReason: "Spam links in every caption",
        updatedAt: new Date("2026-11-19T00:00:00.000Z"),
      }),
    ])
    .run()
  database
    .insert(auditEvents)
    .values([
      {
        id: "hide-1",
        actorId: "admin",
        action: "post.hide",
        entityType: "post",
        entityId: "moderated",
        createdAt: new Date("2026-11-10T00:00:00.000Z"),
      },
      {
        id: "restore-1",
        actorId: "admin",
        action: "post.restore",
        entityType: "post",
        entityId: "moderated",
        createdAt: new Date("2026-11-11T00:00:00.000Z"),
      },
      {
        id: "hide-2",
        actorId: "admin",
        action: "post.hide",
        entityType: "post",
        entityId: "moderated",
        createdAt: new Date("2026-11-12T00:00:00.000Z"),
      },
    ])
    .run()
  return database
}

type TestDatabase = ReturnType<typeof seedDatabase>

const viewers = {
  anonymous: null,
  owner: { id: "owner", role: "user", banned: false },
  admin: { id: "admin", role: "admin", banned: false },
  other: { id: "other", role: "user", banned: false },
} as const

/** What each viewer gets on the post page: the post, a tombstone, or not found. */
type PageResult = "post" | "tombstone" | "not-found"

async function postPageResults(database: TestDatabase, postId: string) {
  const results: Partial<Record<keyof typeof viewers, PageResult>> = {}
  for (const name of Object.keys(viewers) as (keyof typeof viewers)[]) {
    const viewer = viewers[name]
    // The post page loads the shared post first and asks for a tombstone only when it is missing.
    const post = await getPublishedPostRead(database, postId)
    const tombstone = post
      ? null
      : await findModeratedPostTombstone(database, requestActor(viewer, now), postId, now)
    results[name] = post ? "post" : tombstone ? "tombstone" : "not-found"
  }
  return results
}

describe("post page visibility", () => {
  it.each([
    ["public", { anonymous: "post", owner: "post", admin: "post", other: "post" }],
    ["unlisted", { anonymous: "post", owner: "post", admin: "post", other: "post" }],
    [
      "draft",
      { anonymous: "not-found", owner: "not-found", admin: "not-found", other: "not-found" },
    ],
    [
      "deleted",
      { anonymous: "not-found", owner: "not-found", admin: "not-found", other: "not-found" },
    ],
    [
      "moderated",
      { anonymous: "not-found", owner: "tombstone", admin: "tombstone", other: "not-found" },
    ],
    [
      "missing",
      { anonymous: "not-found", owner: "not-found", admin: "not-found", other: "not-found" },
    ],
  ] as const)("resolves a %s post for each viewer", async (postId, expected) => {
    const database = seedDatabase()
    expect(await postPageResults(database, postId)).toEqual(expected)
  })

  it("tells the owner and an administrator what was hidden, when, and why", async () => {
    const database = seedDatabase()
    const owner = await findModeratedPostTombstone(
      database,
      requestActor(viewers.owner, now),
      "moderated",
      now,
    )
    const admin = await findModeratedPostTombstone(
      database,
      requestActor(viewers.admin, now),
      "moderated",
      now,
    )
    const expected = {
      kind: "moderated" as const,
      id: "moderated",
      type: "images" as const,
      title: "Weekend dump",
      moderationReason: "Spam links in every caption",
      // The latest hide, not the post's update time, which an edit can move.
      hiddenAt: new Date("2026-11-12T00:00:00.000Z"),
      author: { name: "Owner", username: "Owner", normalizedUsername: "owner" },
    }
    expect(owner).toEqual({ ...expected, viewer: "owner" })
    expect(admin).toEqual({ ...expected, viewer: "admin" })
  })

  it("leaves the hide time empty when the audit log has no hide event", async () => {
    const database = seedDatabase()
    database.delete(auditEvents).where(eq(auditEvents.entityId, "moderated")).run()
    const tombstone = await findModeratedPostTombstone(
      database,
      requestActor(viewers.owner, now),
      "moderated",
      now,
    )
    expect(tombstone?.hiddenAt).toBeNull()
  })

  it("treats a banned administrator and a banned owner as strangers", async () => {
    const database = seedDatabase()
    const banExpires = new Date("2026-12-01T00:00:00.000Z")
    for (const viewer of [
      { ...viewers.admin, banned: true, banExpires },
      { ...viewers.owner, banned: true, banExpires: null },
    ]) {
      expect(
        await findModeratedPostTombstone(database, requestActor(viewer, now), "moderated", now),
      ).toBeNull()
    }
    const expiredBan = { ...viewers.admin, banned: true, banExpires: publishedAt }
    expect(
      await findModeratedPostTombstone(database, requestActor(expiredBan, now), "moderated", now),
    ).not.toBeNull()
  })

  it("keeps a banned author's published post hidden but shows administrators its tombstone", async () => {
    const database = seedDatabase()
    database.update(user).set({ banned: true, banExpires: null }).where(eq(user.id, "owner")).run()
    expect(await postPageResults(database, "public")).toEqual({
      anonymous: "not-found",
      owner: "not-found",
      admin: "not-found",
      other: "not-found",
    })
    expect((await postPageResults(database, "moderated")).admin).toBe("tombstone")
  })
})
