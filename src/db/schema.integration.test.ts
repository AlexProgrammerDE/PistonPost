import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"

import { createPost, createUser } from "./factories"
import {
  comments,
  emailCampaignDeliveries,
  emailCampaigns,
  outbox,
  postTags,
  posts,
  profiles,
  reactions,
  tagFollows,
  tags,
  user,
  userFollows,
} from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

function database() {
  const testDatabase = createMigratedTestDatabase()
  close = () => testDatabase.$client.close()
  return testDatabase
}

describe("domain schema", () => {
  it("enables foreign keys and creates the hot-path indexes", () => {
    const db = database()
    const foreignKeys = db.$client.query("PRAGMA foreign_keys").get() as {
      foreign_keys: number
    }
    const postIndexes = db.$client.query("PRAGMA index_list('posts')").all() as Array<{
      name: string
    }>

    expect(foreignKeys.foreign_keys).toBe(1)
    expect(postIndexes.map((index) => index.name)).toContain("posts_discovery_idx")
    expect(postIndexes.map((index) => index.name)).toContain("posts_author_status_created_idx")
  })

  it("removes retired migration bookkeeping tables", () => {
    const db = database()
    const legacyTables = db.$client
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('migration_runs', 'migration_mappings')",
      )
      .all()

    expect(legacyTables).toHaveLength(0)
  })

  it("rejects duplicate normalized usernames", () => {
    const db = database()
    db.insert(user)
      .values([
        createUser({ id: "one", email: "one@example.com" }),
        createUser({ id: "two", email: "two@example.com" }),
      ])
      .run()
    db.insert(profiles)
      .values({ userId: "one", username: "Piston", normalizedUsername: "piston" })
      .run()

    expect(() =>
      db
        .insert(profiles)
        .values({ userId: "two", username: "piston", normalizedUsername: "piston" })
        .run(),
    ).toThrow()
  })

  it("rejects invalid reactions and orphaned relationships", () => {
    const db = database()
    db.insert(user).values(createUser()).run()
    db.insert(posts)
      .values(createPost({ id: "post" }))
      .run()

    expect(() =>
      db.$client
        .query("INSERT INTO reactions (post_id, user_id, type) VALUES (?, ?, ?)")
        .run("post", "test-user", "applause"),
    ).toThrow()
    expect(() =>
      db.insert(reactions).values({ postId: "missing", userId: "user", type: "like" }).run(),
    ).toThrow()
    expect(() =>
      db.insert(postTags).values({ postId: "missing", tagId: "missing", ordinal: 0 }).run(),
    ).toThrow()
  })

  it("preserves independent reaction types for one user and post", () => {
    const db = database()
    db.insert(user).values(createUser()).run()
    db.insert(posts)
      .values(createPost({ id: "post" }))
      .run()
    db.insert(reactions)
      .values(
        (["like", "dislike", "heart"] as const).map((type) => ({
          postId: "post",
          userId: "test-user",
          type,
        })),
      )
      .run()

    expect(
      new Set(
        db
          .select()
          .from(reactions)
          .all()
          .map(({ type }) => type),
      ),
    ).toEqual(new Set(["like", "dislike", "heart"]))
  })

  it("enforces stable user and tag follow relationships", () => {
    const db = database()
    db.insert(user)
      .values([
        createUser({ id: "viewer", email: "viewer@example.com" }),
        createUser({ id: "author", email: "author@example.com" }),
      ])
      .run()
    db.insert(tags).values({ id: "art", displayName: "Art", normalizedName: "art" }).run()

    expect(() =>
      db.insert(userFollows).values({ followerId: "viewer", followedUserId: "viewer" }).run(),
    ).toThrow()

    db.insert(userFollows).values({ followerId: "viewer", followedUserId: "author" }).run()
    db.insert(tagFollows).values({ userId: "viewer", tagId: "art" }).run()

    expect(() =>
      db.insert(userFollows).values({ followerId: "viewer", followedUserId: "author" }).run(),
    ).toThrow()
    expect(db.select().from(userFollows).all()).toHaveLength(1)
    expect(db.select().from(tagFollows).all()).toHaveLength(1)

    db.delete(user).where(eq(user.id, "viewer")).run()

    expect(db.select().from(userFollows).all()).toHaveLength(0)
    expect(db.select().from(tagFollows).all()).toHaveLength(0)
  })

  it("rejects published posts without a publication timestamp", () => {
    const db = database()
    db.insert(user).values(createUser()).run()
    expect(() =>
      db
        .insert(posts)
        .values(createPost({ id: "illegal", status: "published" }))
        .run(),
    ).toThrow()
  })

  it("cascades post relationships", () => {
    const db = database()
    db.insert(user).values(createUser()).run()
    db.insert(posts)
      .values(createPost({ id: "post" }))
      .run()
    db.insert(tags).values({ id: "tag", displayName: "cars", normalizedName: "cars" }).run()
    db.insert(postTags).values({ postId: "post", tagId: "tag", ordinal: 0 }).run()
    db.insert(reactions).values({ postId: "post", userId: "test-user", type: "heart" }).run()

    db.delete(posts).run()

    expect(db.select().from(postTags).all()).toHaveLength(0)
    expect(db.select().from(reactions).all()).toHaveLength(0)
  })

  it("keeps replies tied to a parent and removes the thread with its post", () => {
    const db = database()
    db.insert(user)
      .values([
        createUser({ id: "author", email: "author@example.com" }),
        createUser({ id: "reply-author", email: "reply@example.com" }),
      ])
      .run()
    db.insert(posts)
      .values(createPost({ id: "post", authorId: "author" }))
      .run()
    db.insert(comments)
      .values({ id: "parent", postId: "post", authorId: "author", content: "First" })
      .run()
    db.insert(comments)
      .values({
        id: "reply",
        postId: "post",
        authorId: "reply-author",
        parentId: "parent",
        content: "Second",
      })
      .run()

    expect(db.select().from(comments).where(eq(comments.parentId, "parent")).all()).toHaveLength(1)
    db.delete(posts).where(eq(posts.id, "post")).run()
    expect(db.select().from(comments).all()).toHaveLength(0)
  })

  it("keeps product campaign delivery state tied to an ID-only outbox job", () => {
    const db = database()
    db.insert(user).values(createUser()).run()
    db.insert(emailCampaigns)
      .values({
        id: "campaign",
        createdBy: "test-user",
        subject: "A small update",
        preview: "A useful preview",
        heading: "Something changed",
        message: "Here is what changed.",
      })
      .run()
    db.insert(outbox)
      .values({
        id: "email.product:campaign:test-user",
        kind: "email.product",
        payload: {
          version: 2,
          type: "email.product",
          idempotencyKey: "email.product:campaign:test-user",
          recipientUserId: "test-user",
          campaignId: "campaign",
        },
      })
      .run()
    db.insert(emailCampaignDeliveries)
      .values({
        id: "email.product:campaign:test-user",
        campaignId: "campaign",
        recipientUserId: "test-user",
      })
      .run()

    const payload = db.select({ payload: outbox.payload }).from(outbox).get()?.payload
    expect(JSON.stringify(payload)).not.toContain("@example.com")
    expect(db.select().from(emailCampaignDeliveries).all()).toHaveLength(1)
    db.delete(outbox).run()
    expect(db.select().from(emailCampaignDeliveries).all()).toHaveLength(0)
  })

  it("rejects incomplete campaign actions", () => {
    const db = database()
    db.insert(user).values(createUser()).run()
    expect(() =>
      db
        .insert(emailCampaigns)
        .values({
          id: "invalid-campaign",
          createdBy: "test-user",
          subject: "A small update",
          preview: "A useful preview",
          heading: "Something changed",
          message: "Here is what changed.",
          actionLabel: "Read more",
        })
        .run(),
    ).toThrow()
  })
})
