import { afterEach, describe, expect, it } from "bun:test"

import { createPost, createUser } from "./factories"
import { listOwnedUnlistedPostReads } from "./owned-post-read-model"
import { comments, posts, profiles, reactions, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

function seedDatabase() {
  const database = createMigratedTestDatabase()
  close = () => database.$client.close()
  database
    .insert(user)
    .values([
      createUser({ id: "owner", email: "owner@example.com", name: "Owner" }),
      createUser({ id: "other", email: "other@example.com", name: "Other" }),
    ])
    .run()
  database
    .insert(profiles)
    .values([
      { userId: "owner", username: "Owner", normalizedUsername: "owner" },
      { userId: "other", username: "other", normalizedUsername: "other" },
    ])
    .run()
  const sameTime = new Date("2026-01-03T00:00:00.000Z")
  database
    .insert(posts)
    .values([
      createPost({
        id: "unlisted-c",
        authorId: "owner",
        status: "published",
        visibility: "unlisted",
        publishedAt: sameTime,
      }),
      createPost({
        id: "unlisted-b",
        authorId: "owner",
        status: "published",
        visibility: "unlisted",
        publishedAt: sameTime,
      }),
      createPost({
        id: "unlisted-a",
        authorId: "owner",
        status: "published",
        visibility: "unlisted",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      createPost({
        id: "public",
        authorId: "owner",
        status: "published",
        publishedAt: new Date("2026-01-04T00:00:00.000Z"),
      }),
      createPost({ id: "unlisted-draft", authorId: "owner", visibility: "unlisted" }),
      createPost({
        id: "unlisted-moderated",
        authorId: "owner",
        status: "moderated",
        visibility: "unlisted",
        publishedAt: new Date("2026-01-05T00:00:00.000Z"),
      }),
      createPost({
        id: "unlisted-deleted",
        authorId: "owner",
        status: "deleted",
        visibility: "unlisted",
        publishedAt: new Date("2026-01-05T00:00:00.000Z"),
      }),
      createPost({
        id: "other-unlisted",
        authorId: "other",
        status: "published",
        visibility: "unlisted",
        publishedAt: new Date("2026-01-06T00:00:00.000Z"),
      }),
    ])
    .run()
  return database
}

describe("owned unlisted posts read model", () => {
  it("lists only the owner's published unlisted posts, newest first", async () => {
    const database = seedDatabase()
    database
      .insert(reactions)
      .values([
        { postId: "unlisted-b", userId: "owner" },
        { postId: "unlisted-b", userId: "other" },
      ])
      .run()
    database
      .insert(comments)
      .values({ id: "comment", postId: "unlisted-b", authorId: "other", content: "Nice" })
      .run()

    const page = await listOwnedUnlistedPostReads(database, {
      ownerId: "owner",
      username: "owner",
      cursor: null,
      limit: 12,
    })

    expect(page.posts.map((post) => post.id)).toEqual(["unlisted-c", "unlisted-b", "unlisted-a"])
    expect(page.nextCursor).toBeNull()
    const hydrated = page.posts.find((post) => post.id === "unlisted-b")
    expect(hydrated).toMatchObject({
      visibility: "unlisted",
      heartCount: 2,
      commentCount: 1,
      author: { id: "owner", username: "Owner", normalizedUsername: "owner", name: "Owner" },
    })
  })

  it("pages with a cursor through posts that share a publish time", async () => {
    const database = seedDatabase()

    const first = await listOwnedUnlistedPostReads(database, {
      ownerId: "owner",
      username: "owner",
      cursor: null,
      limit: 1,
    })
    expect(first.posts.map((post) => post.id)).toEqual(["unlisted-c"])
    expect(first.nextCursor).toEqual({
      publishedAt: new Date("2026-01-03T00:00:00.000Z"),
      id: "unlisted-c",
    })

    const second = await listOwnedUnlistedPostReads(database, {
      ownerId: "owner",
      username: "owner",
      cursor: first.nextCursor,
      limit: 1,
    })
    expect(second.posts.map((post) => post.id)).toEqual(["unlisted-b"])

    const last = await listOwnedUnlistedPostReads(database, {
      ownerId: "owner",
      username: "owner",
      cursor: second.nextCursor,
      limit: 1,
    })
    expect(last.posts.map((post) => post.id)).toEqual(["unlisted-a"])
    expect(last.nextCursor).toBeNull()
  })

  it("returns nothing when the viewer looks at another user's profile", async () => {
    const database = seedDatabase()

    const onOtherProfile = await listOwnedUnlistedPostReads(database, {
      ownerId: "owner",
      username: "other",
      cursor: null,
      limit: 12,
    })
    const visitorOnOwnerProfile = await listOwnedUnlistedPostReads(database, {
      ownerId: "other",
      username: "owner",
      cursor: null,
      limit: 12,
    })

    expect(onOtherProfile).toEqual({ posts: [], nextCursor: null })
    expect(visitorOnOwnerProfile).toEqual({ posts: [], nextCursor: null })
  })
})
