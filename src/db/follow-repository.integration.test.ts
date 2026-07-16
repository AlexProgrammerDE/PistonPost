import { afterEach, describe, expect, it } from "bun:test"

import { Effect } from "effect"

import { createUser } from "./factories"
import { createFollowRepository } from "./follow-repository"
import { profiles, tags, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("follow repository", () => {
  it("sets and clears user and tag follows idempotently", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database
      .insert(user)
      .values([
        createUser({ id: "viewer", email: "viewer@example.com" }),
        createUser({ id: "author", email: "author@example.com" }),
      ])
      .run()
    database
      .insert(profiles)
      .values({ userId: "author", username: "Author", normalizedUsername: "author" })
      .run()
    database.insert(tags).values({ id: "art", displayName: "Art", normalizedName: "art" }).run()
    const repository = createFollowRepository(database)

    expect(await Effect.runPromise(repository.findUserFollow("viewer", "author"))).toEqual({
      targetId: "author",
      following: false,
    })
    expect(await Effect.runPromise(repository.findTagFollow("viewer", "art"))).toEqual({
      targetId: "art",
      following: false,
    })

    await Effect.runPromise(repository.setUserFollow("viewer", "author", true))
    await Effect.runPromise(repository.setUserFollow("viewer", "author", true))
    await Effect.runPromise(repository.setTagFollow("viewer", "art", true))
    await Effect.runPromise(repository.setTagFollow("viewer", "art", true))

    expect(await Effect.runPromise(repository.findUserFollow("viewer", "author"))).toEqual({
      targetId: "author",
      following: true,
    })
    expect(await Effect.runPromise(repository.findTagFollow("viewer", "art"))).toEqual({
      targetId: "art",
      following: true,
    })

    await Effect.runPromise(repository.setUserFollow("viewer", "author", false))
    await Effect.runPromise(repository.setTagFollow("viewer", "art", false))

    expect(
      (await Effect.runPromise(repository.findUserFollow("viewer", "author")))?.following,
    ).toBe(false)
    expect((await Effect.runPromise(repository.findTagFollow("viewer", "art")))?.following).toBe(
      false,
    )
  })
})
