import { afterEach, describe, expect, it } from "bun:test"

import { listPublicAtomFeedRecords } from "./atom-feed-read-model"
import { createPost, createUser } from "./factories"
import { posts, profiles, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("Atom feed read model", () => {
  it("returns only recent public posts from search-indexable authors", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    const now = new Date()
    database
      .insert(user)
      .values([
        createUser({ id: "trusted", email: "trusted@example.com" }),
        createUser({
          id: "probation",
          email: "probation@example.com",
          createdAt: now,
          updatedAt: now,
        }),
        createUser({
          id: "admin",
          email: "admin@example.com",
          emailVerified: false,
          role: "admin",
          createdAt: now,
          updatedAt: now,
        }),
      ])
      .run()
    database
      .insert(profiles)
      .values([
        { userId: "trusted", username: "Trusted", normalizedUsername: "trusted" },
        { userId: "probation", username: "Probation", normalizedUsername: "probation" },
        { userId: "admin", username: "Admin", normalizedUsername: "admin" },
      ])
      .run()
    database
      .insert(posts)
      .values([
        createPost({
          id: "probation-post",
          authorId: "probation",
          status: "published",
          publishedAt: new Date("2026-07-19T12:00:00.000Z"),
        }),
        createPost({
          id: "unlisted-post",
          authorId: "trusted",
          status: "published",
          visibility: "unlisted",
          publishedAt: new Date("2026-07-19T11:00:00.000Z"),
        }),
        createPost({
          id: "admin-post",
          authorId: "admin",
          status: "published",
          publishedAt: new Date("2026-07-19T10:00:00.000Z"),
        }),
        createPost({
          id: "trusted-post",
          authorId: "trusted",
          status: "published",
          publishedAt: new Date("2026-07-18T10:00:00.000Z"),
        }),
        createPost({ id: "draft-post", authorId: "trusted", status: "draft" }),
      ])
      .run()

    const records = await listPublicAtomFeedRecords(database)

    expect(records.map((record) => record.id)).toEqual(["admin-post", "trusted-post"])
    expect(records.map((record) => record.author.normalizedUsername)).toEqual(["admin", "trusted"])
  })
})
