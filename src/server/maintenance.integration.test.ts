import { afterEach, describe, expect, test } from "bun:test"

import { eq, sql as drizzleSql } from "drizzle-orm"
import { Effect, Exit } from "effect"

import { createPost, createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { mediaCleanupJob } from "./jobs"
import {
  abandonedDraftStatements,
  abandonedMediaStatement,
  type MaintenanceStatement,
  reconcileStreamAssets,
  reconcileVideoDownloadAssets,
  type StreamVideoLookup,
  type StreamVideoState,
} from "./maintenance"

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
      .where(drizzleSql`true`)
      .run()
    run(db, abandonedDraftStatements("draft", now))

    expect(db.select().from(schema.posts).all()).toHaveLength(1)
    expect(db.select().from(schema.postMedia).all()).toHaveLength(1)
    expect(db.select().from(schema.outbox).all()).toHaveLength(0)
  })
})

type Asset = typeof schema.mediaAssets.$inferInsert

function asset(overrides: Partial<Asset> = {}): Asset {
  const id = crypto.randomUUID()
  return {
    ...image(id, {}),
    createdAt: new Date(now - day - 1),
    ...overrides,
  }
}

function setupMedia() {
  const db = createMigratedTestDatabase()
  databases.push(db)
  db.insert(schema.user).values(createUser()).run()
  db.insert(schema.profiles)
    .values({ userId: "test-user", username: "test", normalizedUsername: "test" })
    .run()
  db.insert(schema.posts)
    .values(
      createPost({
        id: "posted",
        type: "images",
        textContent: null,
        status: "published",
        publishedAt: new Date(now - 2 * day),
      }),
    )
    .run()
  const queue = () => run(db, [abandonedMediaStatement(now)])[0]
  return { db, queue }
}

describe("abandoned media cleanup", () => {
  test("queues failed avatars and failed images left behind by a posted draft", () => {
    const { db, queue } = setupMedia()
    const failedAvatar = asset({ kind: "avatar", status: "failed", providerMetadata: {} })
    const failedDraftImage = asset({ status: "failed", providerMetadata: { postId: "posted" } })
    db.insert(schema.mediaAssets).values([failedAvatar, failedDraftImage]).run()

    const queued = queue()
    expect(queued).toHaveLength(2)
    expect(queued).toEqual(
      expect.arrayContaining([{ mediaId: failedAvatar.id }, { mediaId: failedDraftImage.id }]),
    )
    expect(
      db
        .select({ payload: schema.outbox.payload })
        .from(schema.outbox)
        .all()
        .map(({ payload }) => payload),
    ).toEqual(
      expect.arrayContaining([
        mediaCleanupJob(failedAvatar.id),
        mediaCleanupJob(failedDraftImage.id),
      ]),
    )
  })

  test("keeps media that a post or profile still uses and recent failures", () => {
    const { db, queue } = setupMedia()
    const posted = asset()
    // A failed avatar never becomes current. The check still guards a profile that points at one.
    const avatar = asset({ kind: "avatar", status: "failed" })
    const failedVideo = asset({ kind: "video", provider: "stream", status: "failed", r2Key: null })
    const recentFailure = asset({ status: "failed", createdAt: new Date(now - day + 60_000) })
    db.insert(schema.mediaAssets).values([posted, avatar, failedVideo, recentFailure]).run()
    db.insert(schema.postMedia)
      .values([
        { postId: "posted", mediaId: posted.id, ordinal: 0 },
        { postId: "posted", mediaId: failedVideo.id, ordinal: 1 },
      ])
      .run()
    db.update(schema.profiles)
      .set({ avatarMediaId: avatar.id })
      .where(eq(schema.profiles.userId, "test-user"))
      .run()

    expect(queue()).toEqual([])
    expect(db.select().from(schema.outbox).all()).toHaveLength(0)
  })

  test("skips media whose cleanup is already queued so newer leftovers get a slot", () => {
    const { db, queue } = setupMedia()
    const queued = Array.from({ length: 100 }, (_, index) =>
      asset({ status: "failed", createdAt: new Date(now - 3 * day + index) }),
    )
    const waiting = asset({ status: "failed" })
    db.insert(schema.mediaAssets)
      .values([...queued, waiting])
      .run()
    for (const { id } of queued) {
      db.insert(schema.outbox)
        .values({
          id: `media.cleanup:${id}`,
          kind: "media.cleanup",
          payload: mediaCleanupJob(id),
          processedAt: new Date(now),
        })
        .run()
    }

    expect(queue()).toEqual([{ mediaId: waiting.id }])
  })
})

function processingVideo(streamUid: string) {
  return {
    id: crypto.randomUUID(),
    ownerId: "test-user",
    kind: "video" as const,
    provider: "stream" as const,
    status: "processing" as const,
    streamUid,
    originalFilename: "clip.mp4",
    mimeType: "video/mp4",
    byteSize: 128,
  }
}

function streamVideo(state: Partial<StreamVideoState> = {}): StreamVideoState {
  return {
    readyToStream: true,
    duration: 2,
    size: 256,
    status: { state: "ready" },
    input: { width: 640, height: 360 },
    ...state,
  }
}

const download = {
  status: "ready" as const,
  url: "https://customer.cloudflarestream.com/video/downloads/default.mp4",
  percentComplete: 100,
}

function streamLookup(
  details: (streamUid: string) => Promise<StreamVideoState>,
): StreamVideoLookup {
  return (streamUid) => ({
    details: () => details(streamUid),
    downloads: {
      generate: () => Promise.resolve({ default: download }),
      get: () => Promise.resolve({ default: download }),
    },
  })
}

function setupVideos(streamUids: readonly string[]) {
  const db = createMigratedTestDatabase()
  databases.push(db)
  db.insert(schema.user).values(createUser()).run()
  const videos = streamUids.map((uid) => processingVideo(uid))
  db.insert(schema.mediaAssets).values(videos).run()
  const status = (id: string) =>
    db
      .select({ status: schema.mediaAssets.status })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, id))
      .get()?.status
  return { db, videos, status }
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

describe("Stream reconciliation", () => {
  test("marks a video that Stream no longer has as failed and reconciles the rest", async () => {
    const { db, videos, status } = setupVideos(["gone", "a", "b", "c", "d", "e"])
    const lookup = streamLookup(async (uid) => {
      if (uid === "gone") throw Object.assign(new Error("Not found"), { name: "NotFoundError" })
      await delay(5)
      return streamVideo()
    })

    const exit = await Effect.runPromiseExit(reconcileStreamAssets(db, lookup))

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(videos.map(({ id }) => status(id))).toEqual([
      "failed",
      "ready",
      "ready",
      "ready",
      "ready",
      "ready",
    ])
    expect(
      db
        .select({ metadata: schema.mediaAssets.providerMetadata })
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.status, "ready"))
        .all()
        .map(({ metadata }) => metadata["streamDownloadStatus"]),
    ).toEqual(["ready", "ready", "ready", "ready", "ready"])
  })

  test("reconciles the other videos when one Stream lookup keeps failing", async () => {
    const { db, videos, status } = setupVideos(["broken", "a", "b", "c", "d", "e"])
    const lookup = streamLookup(async (uid) => {
      if (uid === "broken") throw new Error("Stream is unavailable")
      await delay(5)
      return streamVideo()
    })

    const exit = await Effect.runPromiseExit(reconcileStreamAssets(db, lookup))

    // The task still reports the failure so the scheduled run surfaces it.
    expect(Exit.isFailure(exit)).toBe(true)
    expect(videos.map(({ id }) => status(id))).toEqual([
      "processing",
      "ready",
      "ready",
      "ready",
      "ready",
      "ready",
    ])
  })

  test("checks videos that waited longest first, so a full batch cannot starve the rest", async () => {
    const { db, videos } = setupVideos(Array.from({ length: 26 }, (_, index) => `uid-${index}`))
    const checked: string[] = []
    const lookup = streamLookup((uid) => {
      checked.push(uid)
      return Promise.resolve(streamVideo({ readyToStream: false, status: { state: "inprogress" } }))
    })

    await Effect.runPromise(reconcileStreamAssets(db, lookup))
    const firstRun = checked.splice(0)
    await Effect.runPromise(reconcileStreamAssets(db, lookup))

    expect(firstRun).toHaveLength(25)
    const skipped = videos
      .map(({ streamUid }) => streamUid)
      .filter((uid) => !firstRun.includes(uid))
    expect(skipped).toHaveLength(1)
    expect(checked).toEqual(expect.arrayContaining(skipped))
  })

  test("does not revive a video that cleanup deleted during the Stream lookup", async () => {
    const { db, videos, status } = setupVideos(["clip"])
    const [video] = videos
    if (!video) throw new Error("missing video")
    const lookup = streamLookup(() => {
      db.update(schema.mediaAssets)
        .set({ status: "deleted", deletedAt: new Date() })
        .where(eq(schema.mediaAssets.id, video.id))
        .run()
      return Promise.resolve(streamVideo({ readyToStream: false, status: { state: "inprogress" } }))
    })

    await Effect.runPromise(reconcileStreamAssets(db, lookup))

    expect(status(video.id)).toBe("deleted")
  })
})

describe("video download reconciliation", () => {
  test("prepares downloads for other ready videos when one download request fails", async () => {
    const db = createMigratedTestDatabase()
    databases.push(db)
    db.insert(schema.user).values(createUser()).run()
    const gone = { ...processingVideo("gone-video"), status: "ready" as const }
    const healthy = { ...processingVideo("ready-video"), status: "ready" as const }
    db.insert(schema.mediaAssets).values([gone, healthy]).run()
    const pending = { status: "inprogress" as const, percentComplete: 0 }
    const lookup: StreamVideoLookup = (streamUid) => ({
      details: () => Promise.resolve(streamVideo()),
      downloads: {
        generate: () =>
          streamUid === "gone-video"
            ? Promise.reject(new Error("Video not found"))
            : delay(10).then(() => ({ default: pending })),
        get: () => Promise.resolve({}),
      },
    })

    const exit = await Effect.runPromiseExit(reconcileVideoDownloadAssets(db, lookup))

    // The failing video still fails the run so the cron reports it.
    expect(Exit.isFailure(exit)).toBe(true)
    const row = db
      .select({ providerMetadata: schema.mediaAssets.providerMetadata })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, healthy.id))
      .get()
    expect(row?.providerMetadata).toEqual({ streamDownloadStatus: "inprogress" })
  })
})
