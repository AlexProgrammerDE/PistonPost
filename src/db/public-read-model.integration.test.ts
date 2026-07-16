import { afterEach, describe, expect, it } from "bun:test"

import { createPost, createUser } from "./factories"
import { listPublicPostReads } from "./public-read-model"
import { postTags, posts, profiles, tagFollows, tags, user, userFollows } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("following feed read model", () => {
  it("combines followed users and tags without duplicate or private posts", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database
      .insert(user)
      .values([
        createUser({ id: "viewer", email: "viewer@example.com", name: "Viewer" }),
        createUser({ id: "followed", email: "followed@example.com", name: "Followed" }),
        createUser({ id: "tag-author", email: "tag@example.com", name: "Tag Author" }),
        createUser({ id: "other", email: "other@example.com", name: "Other" }),
      ])
      .run()
    database
      .insert(profiles)
      .values([
        { userId: "viewer", username: "viewer", normalizedUsername: "viewer" },
        { userId: "followed", username: "followed", normalizedUsername: "followed" },
        { userId: "tag-author", username: "tag-author", normalizedUsername: "tag-author" },
        { userId: "other", username: "other", normalizedUsername: "other" },
      ])
      .run()
    database
      .insert(posts)
      .values([
        createPost({
          id: "followed-and-tagged",
          authorId: "followed",
          status: "published",
          publishedAt: new Date("2026-01-04T00:00:00.000Z"),
        }),
        createPost({
          id: "tagged",
          authorId: "tag-author",
          status: "published",
          publishedAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
        createPost({
          id: "followed",
          authorId: "followed",
          status: "published",
          publishedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
        createPost({
          id: "unlisted",
          authorId: "followed",
          status: "published",
          visibility: "unlisted",
          publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        createPost({
          id: "unrelated",
          authorId: "other",
          status: "published",
          publishedAt: new Date("2025-12-31T00:00:00.000Z"),
        }),
      ])
      .run()
    database.insert(tags).values({ id: "art", displayName: "Art", normalizedName: "art" }).run()
    database
      .insert(postTags)
      .values([
        { postId: "followed-and-tagged", tagId: "art", ordinal: 0 },
        { postId: "tagged", tagId: "art", ordinal: 0 },
      ])
      .run()
    database.insert(userFollows).values({ followerId: "viewer", followedUserId: "followed" }).run()
    database.insert(tagFollows).values({ userId: "viewer", tagId: "art" }).run()

    const page = await listPublicPostReads(database, {
      cursor: null,
      followingUserId: "viewer",
      limit: 12,
    })

    expect(page.posts.map((post) => post.id)).toEqual(["followed-and-tagged", "tagged", "followed"])
    expect(page.nextCursor).toBeNull()
  })
})
