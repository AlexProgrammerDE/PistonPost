import { afterEach, describe, expect, it } from "bun:test"

import { Effect } from "effect"

import { createPost, createUser } from "./factories"
import { createPostRepository } from "./post-repository"
import { posts, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

function setup() {
  const database = createMigratedTestDatabase()
  database.insert(user).values(createUser()).run()
  close = () => database.$client.close()
  return { database, repository: createPostRepository(database) }
}

describe("post repository", () => {
  it("returns only public published posts in stable cursor order", async () => {
    const { database, repository } = setup()
    const older = new Date("2026-01-01T00:00:00.000Z")
    const newer = new Date("2026-01-02T00:00:00.000Z")

    database
      .insert(posts)
      .values([
        createPost({ id: "a", status: "published", publishedAt: older }),
        createPost({ id: "b", status: "published", publishedAt: newer }),
        createPost({
          id: "unlisted",
          status: "published",
          visibility: "unlisted",
          publishedAt: newer,
        }),
        createPost({ id: "draft" }),
      ])
      .run()

    const firstPage = await Effect.runPromise(repository.listPublic({ cursor: null, limit: 1 }))
    const secondPage = await Effect.runPromise(
      repository.listPublic({ cursor: { publishedAt: newer, id: "b" }, limit: 10 }),
    )

    expect(firstPage.map((post) => post.id)).toEqual(["b"])
    expect(secondPage.map((post) => post.id)).toEqual(["a"])
  })

  it("inserts and retrieves a post", async () => {
    const { repository } = setup()
    const post = createPost({ id: "round-trip" })

    await Effect.runPromise(repository.insert(post))

    expect(await Effect.runPromise(repository.findById(post.id))).toEqual(post)
  })
})
