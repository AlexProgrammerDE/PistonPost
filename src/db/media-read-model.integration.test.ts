import { describe, expect, test } from "bun:test"

import { createPost, createUser } from "./factories"
import { imageDeliveryQuery, ownedMediaStatusQuery } from "./media-read-model"
import { mediaAssets, postMedia, posts, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

describe("owned media status", () => {
  test("reads a full gallery within D1 limits and excludes other or unrequested media", async () => {
    const database = createMigratedTestDatabase()
    try {
      database
        .insert(user)
        .values([
          createUser({ id: "owner" }),
          createUser({ id: "other", email: "other@example.com" }),
        ])
        .run()
      const mediaIds = Array.from({ length: 150 }, () => crypto.randomUUID())
      const otherId = crypto.randomUUID()
      const unrequestedId = crypto.randomUUID()
      database
        .insert(mediaAssets)
        .values(
          [...mediaIds, otherId, unrequestedId].map((id): typeof mediaAssets.$inferInsert => ({
            id,
            ownerId: id === otherId ? "other" : "owner",
            kind: "image",
            provider: "r2",
            status: "ready",
            originalFilename: "image.png",
            mimeType: "image/png",
            byteSize: 1,
          })),
        )
        .run()

      const query = ownedMediaStatusQuery(database, "owner", mediaIds)
      expect(query.toSQL().params).toHaveLength(2)
      const rows = await query
      expect(new Set(rows.map(({ id }) => id))).toEqual(new Set(mediaIds))
      expect(rows.every(({ status }) => status === "ready")).toBe(true)
      expect(await ownedMediaStatusQuery(database, "owner", [otherId])).toEqual([])
    } finally {
      database.$client.close()
    }
  })
})

describe("image delivery", () => {
  type PostSetup = Partial<typeof posts.$inferInsert> & { id: string }

  // Attaches one image to each post in the given order. The read must not depend on that order.
  async function deliveredPostId(attached: readonly PostSetup[]) {
    const database = createMigratedTestDatabase()
    try {
      database
        .insert(user)
        .values([
          createUser({ id: "author" }),
          createUser({ id: "banned", email: "banned@example.com", banned: true }),
        ])
        .run()
      const mediaId = crypto.randomUUID()
      database
        .insert(mediaAssets)
        .values({
          id: mediaId,
          ownerId: "author",
          kind: "image",
          provider: "r2",
          status: "ready",
          r2Key: mediaId,
          originalFilename: "image.png",
          mimeType: "image/png",
          byteSize: 1,
        })
        .run()
      for (const post of attached) {
        database
          .insert(posts)
          .values(createPost({ authorId: "author", type: "images", textContent: null, ...post }))
          .run()
        database.insert(postMedia).values({ postId: post.id, mediaId, ordinal: 0 }).run()
      }
      const rows = await imageDeliveryQuery(database, mediaId)
      expect(rows).toHaveLength(1)
      return rows[0]?.postId
    } finally {
      database.$client.close()
    }
  }

  const published = { status: "published", publishedAt: new Date(0) } as const

  test("uses a public post over a draft that holds the same image", async () => {
    expect(await deliveredPostId([{ id: "a-draft" }, { id: "b-public", ...published }])).toBe(
      "b-public",
    )
  })

  test("uses an unlisted post over a public post by a banned author", async () => {
    expect(
      await deliveredPostId([
        { id: "a-banned", authorId: "banned", ...published },
        { id: "b-unlisted", visibility: "unlisted", ...published },
      ]),
    ).toBe("b-unlisted")
  })

  test("picks the same post whatever order the image was attached in", async () => {
    const first = { id: "a-public", ...published }
    const second = { id: "b-public", ...published }
    expect(await deliveredPostId([first, second])).toBe("a-public")
    expect(await deliveredPostId([second, first])).toBe("a-public")
  })
})
