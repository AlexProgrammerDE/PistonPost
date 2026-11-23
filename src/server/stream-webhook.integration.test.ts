import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import { Effect } from "effect"

import { createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { decodeStreamWebhookPayload, storeStreamWebhookState } from "./stream-webhook"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})

const downloadUrl = "https://customer-example.cloudflarestream.com/video-one/downloads/default.mp4"

function payload(state: string, readyToStream: boolean) {
  const decoded = decodeStreamWebhookPayload(
    JSON.stringify({
      uid: "video-one",
      readyToStream,
      status: { state },
      duration: 2.5,
      size: 2048,
      input: { width: 640, height: 360 },
    }),
  )
  if (!decoded) throw new Error("The test payload did not decode.")
  return decoded
}

function setup() {
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
      status: "processing",
      streamUid: "video-one",
      originalFilename: "clip.mp4",
      mimeType: "video/mp4",
      byteSize: 128,
      providerMetadata: { streamState: "inprogress" },
    })
    .run()
  const row = () =>
    db
      .select({
        status: schema.mediaAssets.status,
        providerMetadata: schema.mediaAssets.providerMetadata,
      })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, mediaId))
      .get()
  return { db, mediaId, row }
}

describe("Stream webhook state", () => {
  test("keeps a download link that was stored after the webhook read the asset", async () => {
    const { db, mediaId, row } = setup()
    db.update(schema.mediaAssets)
      .set({ providerMetadata: { streamDownloadStatus: "ready", streamDownloadUrl: downloadUrl } })
      .where(eq(schema.mediaAssets.id, mediaId))
      .run()

    await Effect.runPromise(
      storeStreamWebhookState(
        db,
        { id: mediaId, status: "processing" },
        payload("ready", true),
        "ready",
        new Date(),
      ),
    )

    expect(row()).toEqual({
      status: "ready",
      providerMetadata: {
        streamDownloadStatus: "ready",
        streamDownloadUrl: downloadUrl,
        streamState: "ready",
      },
    })
  })

  test("does not revive an asset that cleanup deleted after the webhook read it", async () => {
    const { db, mediaId, row } = setup()
    db.update(schema.mediaAssets)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(schema.mediaAssets.id, mediaId))
      .run()

    const updated = await Effect.runPromise(
      storeStreamWebhookState(
        db,
        { id: mediaId, status: "processing" },
        payload("ready", true),
        "ready",
        new Date(),
      ),
    )

    expect(updated).toEqual([])
    expect(row()?.status).toBe("deleted")
  })
})
