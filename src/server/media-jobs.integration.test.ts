import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import { Effect } from "effect"

import { createMigratedTestDatabase, createPost, createUser, schema } from "@/db"

import { authorVideoPostIds, mediaAttachedToLivePost, syncPostVideoAccess } from "./media-jobs"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})

function setup(status: "published" | "moderated" | "deleted" | "draft") {
  const db = createMigratedTestDatabase()
  databases.push(db)
  db.insert(schema.user).values(createUser()).run()
  const post = createPost({
    id: "post",
    type: "video",
    status,
    textContent: null,
    publishedAt: status === "draft" ? null : new Date(),
  })
  db.insert(schema.posts).values(post).run()
  const mediaId = crypto.randomUUID()
  db.insert(schema.mediaAssets)
    .values({
      id: mediaId,
      ownerId: "test-user",
      kind: "video",
      provider: "stream",
      status: "ready",
      streamUid: "stream-video",
      originalFilename: "clip.mp4",
      mimeType: "video/mp4",
      byteSize: 128,
    })
    .run()
  db.insert(schema.postMedia).values({ postId: "post", mediaId, ordinal: 0 }).run()
  return { db, mediaId }
}

function sync(db: ReturnType<typeof setup>["db"]) {
  const updates: Array<[string, boolean]> = []
  return Effect.runPromise(
    syncPostVideoAccess(db, "post", async (uid, required) => {
      updates.push([uid, required])
    }),
  ).then((reason) => ({ reason, updates }))
}

describe("post video access", () => {
  test("requires signed URLs while a post is hidden and lifts them after restore", async () => {
    const { db } = setup("moderated")
    expect(await sync(db)).toEqual({
      reason: "signed-urls-required",
      updates: [["stream-video", true]],
    })
    db.update(schema.posts).set({ status: "published" }).where(eq(schema.posts.id, "post")).run()
    // A late replay of the hide job follows the restored state.
    expect(await sync(db)).toEqual({
      reason: "public-playback",
      updates: [["stream-video", false]],
    })
  })

  test("requires signed URLs while the author is banned and lifts them after the ban", async () => {
    const { db } = setup("published")
    expect(await Effect.runPromise(authorVideoPostIds(db, "test-user"))).toEqual(["post"])
    db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, "test-user")).run()
    expect(await sync(db)).toEqual({
      reason: "signed-urls-required",
      updates: [["stream-video", true]],
    })
    // An expired ban no longer applies.
    db.update(schema.user)
      .set({ banExpires: new Date(Date.now() - 1000) })
      .where(eq(schema.user.id, "test-user"))
      .run()
    expect(await sync(db)).toEqual({
      reason: "public-playback",
      updates: [["stream-video", false]],
    })
  })

  test("skips posts that are gone and tolerates videos Stream already removed", async () => {
    expect(await sync(setup("deleted").db)).toEqual({ reason: "post-unavailable", updates: [] })
    const { db } = setup("moderated")
    expect(
      await Effect.runPromise(
        syncPostVideoAccess(db, "post", async () => {
          throw Object.assign(new Error("Video not found"), {
            name: "NotFoundError",
            code: 10003,
            statusCode: 404,
          })
        }),
      ),
    ).toBe("signed-urls-required")
  })
})

describe("media cleanup guard", () => {
  test("keeps media shown by a live post and releases it once the post is deleted", async () => {
    const { db, mediaId } = setup("published")
    expect(await Effect.runPromise(mediaAttachedToLivePost(db, mediaId))).toBe(true)
    db.update(schema.posts).set({ status: "moderated" }).where(eq(schema.posts.id, "post")).run()
    expect(await Effect.runPromise(mediaAttachedToLivePost(db, mediaId))).toBe(true)
    db.update(schema.posts).set({ status: "deleted" }).where(eq(schema.posts.id, "post")).run()
    expect(await Effect.runPromise(mediaAttachedToLivePost(db, mediaId))).toBe(false)
  })

  test("does not protect media attached only to a draft", async () => {
    const { db, mediaId } = setup("draft")
    expect(await Effect.runPromise(mediaAttachedToLivePost(db, mediaId))).toBe(false)
  })
})
