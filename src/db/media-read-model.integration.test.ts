import { describe, expect, test } from "bun:test"

import { createUser } from "./factories"
import { ownedMediaStatusQuery } from "./media-read-model"
import { mediaAssets, user } from "./schema"
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
