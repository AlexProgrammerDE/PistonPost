import { afterEach, describe, expect, it } from "bun:test"

import { createPost, createUser } from "./factories"
import { postTags, posts, profiles, reactions, tags, user } from "./schema"
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
})
