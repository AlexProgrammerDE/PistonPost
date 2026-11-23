import { afterEach, describe, expect, test } from "bun:test"

import { createPost, createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { imageUploadIntentSlotsStatement } from "./image-upload-intent-statements"
import { finalizeImageUploadStatements } from "./image-upload-statements"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

type Database = ReturnType<typeof createMigratedTestDatabase>
type AssetStatus = "pending" | "ready" | "failed" | "deleted"

function fixture() {
  const database = createMigratedTestDatabase()
  databases.push(database)
  database.insert(schema.user).values(createUser()).run()
  database
    .insert(schema.posts)
    .values(createPost({ id: "post", type: "images", textContent: null }))
    .run()
  return database
}

function addAsset(database: Database, ordinal: number, status: AssetStatus) {
  const id = crypto.randomUUID()
  database
    .insert(schema.mediaAssets)
    .values({
      id,
      ownerId: "test-user",
      kind: "image",
      provider: "r2",
      status,
      r2Key: `users/test-user/images/${id}/checksum`,
      originalFilename: "cat.png",
      mimeType: "image/png",
      byteSize: 10,
      providerMetadata: { postId: "post", ordinal },
    })
    .run()
  if (status === "ready") {
    database.insert(schema.postMedia).values({ postId: "post", mediaId: id, ordinal }).run()
  }
  return id
}

function slots(database: Database) {
  const { sql, params } = imageUploadIntentSlotsStatement("post", "test-user")
  return database.$client.query(sql).get(...params)
}

describe("image upload intent slots", () => {
  test("an empty draft starts at the first ordinal", () => {
    expect(slots(fixture())).toEqual({ count: 0, nextOrdinal: 0 })
  })

  test("failed and removed uploads free quota but keep their ordinals", () => {
    const database = fixture()
    addAsset(database, 0, "failed")
    addAsset(database, 1, "deleted")
    addAsset(database, 2, "ready")
    addAsset(database, 3, "ready")
    expect(slots(database)).toEqual({ count: 2, nextOrdinal: 4 })
  })

  test("an image added after a failed upload joins the draft", () => {
    const database = fixture()
    addAsset(database, 0, "failed")
    addAsset(database, 1, "ready")
    const result = slots(database) as { nextOrdinal: number }
    const added = crypto.randomUUID()
    const r2Key = `users/test-user/images/${added}/checksum`
    database
      .insert(schema.mediaAssets)
      .values({
        id: added,
        ownerId: "test-user",
        kind: "image",
        provider: "r2",
        status: "pending",
        r2Key,
        originalFilename: "dog.png",
        mimeType: "image/png",
        byteSize: 10,
        providerMetadata: { postId: "post", ordinal: result.nextOrdinal },
      })
      .run()
    const statements = finalizeImageUploadStatements(
      {
        assetId: added,
        r2Key,
        finalizeToken: crypto.randomUUID(),
        mimeType: "image/png",
        byteSize: 10,
        width: 64,
        height: 32,
        checksum: "checksum",
        providerMetadata: { postId: "post", ordinal: result.nextOrdinal },
      },
      { kind: "draft-image", postId: "post", ordinal: result.nextOrdinal },
    )
    database.$client.transaction(() => {
      for (const { sql, params } of statements) database.$client.query(sql).run(...params)
    })()
    expect(
      database.$client
        .query("select count(*) as count from post_media where media_id = ?")
        .get(added),
    ).toEqual({ count: 1 })
  })
})
