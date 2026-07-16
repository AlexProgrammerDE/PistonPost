import { afterEach, describe, expect, it } from "bun:test"

import { createMigratedTestDatabase, createUser, schema } from "@/db"
import { mediaImageUrl } from "@/lib/media-image"

import { isManagedUserAvatar } from "./avatar-policy"

const databases: Array<ReturnType<typeof createMigratedTestDatabase>> = []

afterEach(() => {
  for (const database of databases) database.$client.close()
  databases.length = 0
})

function setupAvatar(status: "pending" | "ready" = "ready") {
  const database = createMigratedTestDatabase()
  const user = createUser()
  const mediaId = crypto.randomUUID()
  databases.push(database)

  database.insert(schema.user).values(user).run()
  database
    .insert(schema.profiles)
    .values({
      userId: user.id,
      username: "test-user",
      normalizedUsername: "test-user",
      avatarMediaId: mediaId,
    })
    .run()
  database
    .insert(schema.mediaAssets)
    .values({
      id: mediaId,
      ownerId: user.id,
      kind: "avatar",
      provider: "r2",
      status,
      r2Key: `users/${user.id}/avatars/${mediaId}/checksum`,
      originalFilename: "avatar.png",
      mimeType: "image/png",
      byteSize: 128,
      width: 128,
      height: 128,
    })
    .run()

  return { database, userId: user.id, mediaId }
}

describe("managed avatar policy", () => {
  it("accepts only the user's active, ready Cloudflare-backed avatar", async () => {
    const { database, userId, mediaId } = setupAvatar()

    expect(await isManagedUserAvatar(database, userId, mediaImageUrl(mediaId, "avatar"))).toBeTrue()
    expect(
      await isManagedUserAvatar(database, userId, "https://tracker.example/pixel.png"),
    ).toBeFalse()
    expect(await isManagedUserAvatar(database, userId, "data:image/png;base64,AAAA")).toBeFalse()
    expect(
      await isManagedUserAvatar(database, userId, `${mediaImageUrl(mediaId, "avatar")}?width=32`),
    ).toBeFalse()
    expect(
      await isManagedUserAvatar(database, "another-user", mediaImageUrl(mediaId, "avatar")),
    ).toBeFalse()
  })

  it("rejects an avatar until its upload is ready", async () => {
    const { database, userId, mediaId } = setupAvatar("pending")

    expect(
      await isManagedUserAvatar(database, userId, mediaImageUrl(mediaId, "avatar")),
    ).toBeFalse()
  })
})
