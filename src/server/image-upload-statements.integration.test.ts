import { afterEach, describe, expect, test } from "bun:test"

import { createMigratedTestDatabase, createPost, createUser, schema } from "@/db"

import {
  finalizeImageUploadStatements,
  reserveImageUploadKeyStatement,
} from "./image-upload-statements"
import type { Statement } from "./post-lifecycle-statements"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

type Database = ReturnType<typeof createMigratedTestDatabase>

function fixture(kind: "image" | "avatar") {
  const database = createMigratedTestDatabase()
  databases.push(database)
  database.insert(schema.user).values(createUser()).run()
  database
    .insert(schema.profiles)
    .values({ userId: "test-user", username: "test-user", normalizedUsername: "test-user" })
    .run()
  database
    .insert(schema.posts)
    .values(createPost({ id: "post", type: "images", textContent: null }))
    .run()
  const assetId = crypto.randomUUID()
  database
    .insert(schema.mediaAssets)
    .values({
      id: assetId,
      ownerId: "test-user",
      kind,
      provider: "r2",
      status: "pending",
      originalFilename: "cat.png",
      mimeType: "image/png",
      byteSize: 10,
      providerMetadata: kind === "image" ? { postId: "post", ordinal: 0 } : {},
    })
    .run()
  return { database, assetId, r2Key: `users/test-user/images/${assetId}/checksum` }
}

function run(database: Database, statements: Statement[]) {
  return database.$client.transaction(() =>
    statements.map(({ sql, params }) => database.$client.query(sql).run(...params).changes),
  )()
}

function finalized(assetId: string, r2Key: string) {
  return {
    assetId,
    r2Key,
    finalizeToken: crypto.randomUUID(),
    mimeType: "image/png",
    byteSize: 10,
    width: 64,
    height: 32,
    checksum: "checksum",
    providerMetadata: { postId: "post", ordinal: 0, placeholderColor: null },
  }
}

function cancel(database: Database, assetId: string) {
  database.$client.run("insert into outbox (id, kind, payload) values (?, 'media.cleanup', '{}')", [
    `media.cleanup:${assetId}`,
  ])
}

describe("image upload finalization", () => {
  test("marks a draft image ready and attaches it to the draft", () => {
    const { database, assetId, r2Key } = fixture("image")
    expect(run(database, [reserveImageUploadKeyStatement(assetId, r2Key)])).toEqual([1])
    const changes = run(
      database,
      finalizeImageUploadStatements(finalized(assetId, r2Key), {
        kind: "draft-image",
        postId: "post",
        ordinal: 0,
      }),
    )
    expect(changes).toEqual([1, 1])
    expect(
      database.$client
        .query("select status, r2_key, width, height from media_assets where id = ?")
        .get(assetId),
    ).toEqual({ status: "ready", r2_key: r2Key, width: 64, height: 32 })
    expect(database.$client.query("select post_id, ordinal from post_media").all()).toEqual([
      { post_id: "post", ordinal: 0 },
    ])
  })

  test("does not reserve a key for a cancelled upload", () => {
    const { database, assetId, r2Key } = fixture("image")
    cancel(database, assetId)
    expect(run(database, [reserveImageUploadKeyStatement(assetId, r2Key)])).toEqual([0])
  })

  test("a cancelled upload cannot become ready or join the post", () => {
    const { database, assetId, r2Key } = fixture("image")
    run(database, [reserveImageUploadKeyStatement(assetId, r2Key)])
    cancel(database, assetId)
    const before = database.$client.serialize()
    const changes = run(
      database,
      finalizeImageUploadStatements(finalized(assetId, r2Key), {
        kind: "draft-image",
        postId: "post",
        ordinal: 0,
      }),
    )
    expect(changes).toEqual([0, 0])
    expect(database.$client.serialize()).toEqual(before)
  })

  test("a failed upload cannot become ready", () => {
    const { database, assetId, r2Key } = fixture("image")
    run(database, [reserveImageUploadKeyStatement(assetId, r2Key)])
    database.$client.run("update media_assets set status = 'failed' where id = ?", [assetId])
    expect(
      run(
        database,
        finalizeImageUploadStatements(finalized(assetId, r2Key), { kind: "edit-image" }),
      ),
    ).toEqual([0])
  })

  test("a losing parallel attempt skips the avatar follow-ups", () => {
    const { database, assetId, r2Key } = fixture("avatar")
    run(database, [reserveImageUploadKeyStatement(assetId, r2Key)])
    const previousAvatarId = crypto.randomUUID()
    const avatar = (auditEventId: string) => ({
      kind: "avatar" as const,
      userId: "test-user",
      image: `/media/image/${assetId}/avatar`,
      previousAvatarId,
      auditEventId,
    })
    expect(
      run(database, finalizeImageUploadStatements(finalized(assetId, r2Key), avatar("first"))),
    ).toEqual([1, 1, 1, 1, 1])
    expect(
      database.$client
        .query("select avatar_media_id from profiles where user_id = 'test-user'")
        .get(),
    ).toEqual({ avatar_media_id: assetId })
    expect(database.$client.query("select image from user where id = 'test-user'").get()).toEqual({
      image: `/media/image/${assetId}/avatar`,
    })
    expect(database.$client.query("select id from outbox").all()).toEqual([
      { id: `media.cleanup:${previousAvatarId}` },
    ])

    const before = database.$client.serialize()
    expect(
      run(database, finalizeImageUploadStatements(finalized(assetId, r2Key), avatar("second"))),
    ).toEqual([0, 0, 0, 0, 0])
    expect(database.$client.serialize()).toEqual(before)
  })
})
