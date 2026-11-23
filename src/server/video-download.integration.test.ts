import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import { Effect } from "effect"

import { createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import type { MediaProviderMetadata } from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { storeRefreshedVideoDownload } from "./video-download"

const downloadUrl = "https://customer-example.cloudflarestream.com/video-one/downloads/default.mp4"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})

function setup(providerMetadata: MediaProviderMetadata) {
  const db = createMigratedTestDatabase()
  databases.push(db)
  db.insert(schema.user).values(createUser()).run()
  const mediaId = crypto.randomUUID()
  db.insert(schema.mediaAssets)
    .values({
      id: mediaId,
      ownerId: "test-user",
      kind: "video",
      provider: "stream",
      status: "ready",
      streamUid: "video-one",
      originalFilename: "clip.mp4",
      mimeType: "video/mp4",
      byteSize: 128,
      providerMetadata,
    })
    .run()
  return { db, mediaId }
}

function storedMetadata(db: ReturnType<typeof setup>["db"], mediaId: string) {
  return db
    .select({ providerMetadata: schema.mediaAssets.providerMetadata })
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.id, mediaId))
    .get()?.providerMetadata
}

describe("refreshed video download storage", () => {
  test("keeps a ready download that a webhook stored after the request read the row", async () => {
    // The request read the row before the webhook finished, so its refresh is older.
    const { db, mediaId } = setup({
      streamState: "ready",
      streamDownloadStatus: "ready",
      streamDownloadUrl: downloadUrl,
    })

    await Effect.runPromise(
      storeRefreshedVideoDownload(db, mediaId, { streamDownloadStatus: "inprogress" }),
    )

    expect(storedMetadata(db, mediaId)).toEqual({
      streamState: "ready",
      streamDownloadStatus: "ready",
      streamDownloadUrl: downloadUrl,
    })
  })

  test("updates only the download keys and keeps concurrent metadata", async () => {
    const { db, mediaId } = setup({ thumbnailTimestampPct: 0.5, streamState: "ready" })

    // The request snapshot predates streamState, which must survive the write.
    await Effect.runPromise(
      storeRefreshedVideoDownload(db, mediaId, {
        thumbnailTimestampPct: 0.5,
        streamDownloadStatus: "inprogress",
      }),
    )
    expect(storedMetadata(db, mediaId)).toEqual({
      thumbnailTimestampPct: 0.5,
      streamState: "ready",
      streamDownloadStatus: "inprogress",
    })

    await Effect.runPromise(
      storeRefreshedVideoDownload(db, mediaId, {
        streamDownloadStatus: "ready",
        streamDownloadUrl: downloadUrl,
      }),
    )
    expect(storedMetadata(db, mediaId)).toEqual({
      thumbnailTimestampPct: 0.5,
      streamState: "ready",
      streamDownloadStatus: "ready",
      streamDownloadUrl: downloadUrl,
    })
  })
})
