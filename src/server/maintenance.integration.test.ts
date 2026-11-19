import { afterEach, describe, expect, test } from "bun:test"

import { createPost, createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { mediaCleanupJob } from "./jobs"
import { abandonedDraftStatements, type MaintenanceStatement } from "./maintenance"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})

const day = 24 * 60 * 60 * 1000
const now = Date.parse("2026-02-01T00:00:00.000Z")

function image(id: string, providerMetadata: Record<string, string>) {
  return {
    id,
    ownerId: "test-user",
    kind: "image" as const,
    provider: "r2" as const,
    status: "ready" as const,
    r2Key: id,
    originalFilename: "cat.png",
    mimeType: "image/png",
    byteSize: 10,
    providerMetadata,
  }
}

function setup(updatedAt: Date) {
  const db = createMigratedTestDatabase()
  databases.push(db)
  db.insert(schema.user).values(createUser()).run()
  db.insert(schema.posts)
    .values(createPost({ id: "draft", type: "images", textContent: null, updatedAt }))
    .run()
  const [attached = "", uploading = "", unrelated = ""] = Array.from({ length: 3 }, () =>
    crypto.randomUUID(),
  )
  db.insert(schema.mediaAssets)
    .values([
      image(attached, { postId: "draft" }),
      image(uploading, { postId: "draft" }),
      image(unrelated, {}),
    ])
    .run()
  db.insert(schema.postMedia).values({ postId: "draft", mediaId: attached, ordinal: 0 }).run()
  return { db, attached, uploading }
}

function run(db: ReturnType<typeof setup>["db"], statements: readonly MaintenanceStatement[]) {
  return db.$client.transaction(() =>
    statements.map(({ sql, params }) => db.$client.query(sql).all(...params)),
  )()
}

describe("abandoned draft cleanup", () => {
  test("deletes a day-old draft and queues cleanup for its uploads", () => {
    const { db, attached, uploading } = setup(new Date(now - day - 1))
    const [queued] = run(db, abandonedDraftStatements("draft", now))

    expect(queued).toHaveLength(2)
    expect(queued).toEqual(expect.arrayContaining([{ mediaId: attached }, { mediaId: uploading }]))
    expect(db.select().from(schema.posts).all()).toHaveLength(0)
    expect(db.select().from(schema.postMedia).all()).toHaveLength(0)
    expect(
      db
        .select({ payload: schema.outbox.payload })
        .from(schema.outbox)
        .all()
        .map(({ payload }) => payload),
    ).toEqual(expect.arrayContaining([mediaCleanupJob(attached), mediaCleanupJob(uploading)]))
    expect(db.select().from(schema.outbox).all()).toHaveLength(2)
  })

  test("keeps a draft that was edited within the last day", () => {
    const { db } = setup(new Date(now - day + 60_000))
    const [queued] = run(db, abandonedDraftStatements("draft", now))

    expect(queued).toHaveLength(0)
    expect(db.select().from(schema.posts).all()).toHaveLength(1)
    expect(db.select().from(schema.outbox).all()).toHaveLength(0)
  })

  test("keeps a post that left draft state before the cleanup ran", () => {
    const { db } = setup(new Date(now - 2 * day))
    db.update(schema.posts)
      .set({ status: "published", publishedAt: new Date(now) })
      .run()
    run(db, abandonedDraftStatements("draft", now))

    expect(db.select().from(schema.posts).all()).toHaveLength(1)
    expect(db.select().from(schema.postMedia).all()).toHaveLength(1)
    expect(db.select().from(schema.outbox).all()).toHaveLength(0)
  })
})
