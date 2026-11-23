import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"

import { findReportTargetOwner } from "./content-report-targets"
import { createPost, createUser } from "./factories"
import { comments, posts, profiles, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

function seedDatabase() {
  const database = createMigratedTestDatabase()
  close = () => {
    database.$client.close()
  }
  database
    .insert(user)
    .values([
      createUser({ id: "author", email: "author@example.com" }),
      createUser({ id: "banned", email: "banned@example.com", banned: true }),
    ])
    .run()
  database
    .insert(profiles)
    .values([
      { userId: "author", username: "author", normalizedUsername: "author" },
      { userId: "banned", username: "banned", normalizedUsername: "banned" },
    ])
    .run()
  database
    .insert(posts)
    .values([
      createPost({
        id: "author-post",
        authorId: "author",
        status: "published",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      createPost({
        id: "banned-post",
        authorId: "banned",
        status: "published",
        publishedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
      createPost({ id: "draft-post", authorId: "author", status: "draft" }),
    ])
    .run()
  database
    .insert(comments)
    .values([
      { id: "author-comment", postId: "author-post", authorId: "author", content: "Visible" },
      { id: "banned-comment", postId: "author-post", authorId: "banned", content: "Hidden" },
      {
        id: "comment-on-banned-post",
        postId: "banned-post",
        authorId: "author",
        content: "On a hidden post",
      },
    ])
    .run()
  return database
}

describe("content report targets", () => {
  it("finds the owner of visible posts, comments, and profiles", async () => {
    const database = seedDatabase()

    expect(await findReportTargetOwner(database, { type: "post", id: "author-post" })).toEqual({
      ownerId: "author",
    })
    expect(
      await findReportTargetOwner(database, { type: "comment", id: "author-comment" }),
    ).toEqual({ ownerId: "author" })
    expect(
      await findReportTargetOwner(database, { type: "profile", normalizedUsername: "author" }),
    ).toEqual({ ownerId: "author" })
    expect(await findReportTargetOwner(database, { type: "post", id: "draft-post" })).toBeNull()
  })

  it("does not find content hidden by an active ban", async () => {
    const database = seedDatabase()

    expect(await findReportTargetOwner(database, { type: "post", id: "banned-post" })).toBeNull()
    expect(
      await findReportTargetOwner(database, { type: "comment", id: "banned-comment" }),
    ).toBeNull()
    expect(
      await findReportTargetOwner(database, { type: "comment", id: "comment-on-banned-post" }),
    ).toBeNull()
    expect(
      await findReportTargetOwner(database, { type: "profile", normalizedUsername: "banned" }),
    ).toBeNull()

    database
      .update(user)
      .set({ banExpires: new Date(Date.now() - 60_000) })
      .where(eq(user.id, "banned"))
      .run()

    expect(await findReportTargetOwner(database, { type: "post", id: "banned-post" })).toEqual({
      ownerId: "banned",
    })
    expect(
      await findReportTargetOwner(database, { type: "profile", normalizedUsername: "banned" }),
    ).toEqual({ ownerId: "banned" })
  })
})
