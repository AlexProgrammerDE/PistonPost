import { afterEach, describe, expect, it } from "bun:test"

import { createPost, createUser } from "./factories"
import { incrementPostViewCount } from "./post-view-repository"
import { posts, postViewCounts, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

const databases: Array<ReturnType<typeof createMigratedTestDatabase>> = []

afterEach(() => {
  for (const database of databases) database.$client.close()
  databases.length = 0
})

describe("post view repository", () => {
  it("increments a post's aggregate count atomically", async () => {
    const database = createMigratedTestDatabase()
    databases.push(database)
    database.insert(user).values(createUser()).run()
    database
      .insert(posts)
      .values(createPost({ id: "viewed-post", status: "published", publishedAt: new Date() }))
      .run()

    await Promise.all(
      Array.from({ length: 10 }, () => incrementPostViewCount(database, "viewed-post")),
    )
    expect(database.select().from(postViewCounts).get()).toEqual({
      postId: "viewed-post",
      viewCount: 10,
    })
  })
})
