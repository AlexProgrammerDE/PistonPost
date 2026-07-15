import { describe, expect, it } from "bun:test"

import { Effect } from "effect"

import { createPost, createUser } from "./factories"
import { posts, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"
import { runSqliteTransaction } from "./transactions"

describe("SQLite transaction helper", () => {
  it("rolls back all writes when an operation fails", () => {
    const database = createMigratedTestDatabase()
    database.insert(user).values(createUser()).run()
    const result = Effect.runSyncExit(
      runSqliteTransaction(database.$client, () => {
        database
          .insert(posts)
          .values(createPost({ id: "first" }))
          .run()
        database
          .insert(posts)
          .values(createPost({ id: "first" }))
          .run()
      }),
    )

    expect(result._tag).toBe("Failure")
    expect(database.select().from(posts).all()).toHaveLength(0)
    database.$client.close()
  })
})
