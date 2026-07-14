import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { BSON } from "bson"

import { loadLegacySource } from "./source"
import { transformLegacySource } from "./transform"

const validFixture = new URL("../fixtures/legacy-valid", import.meta.url).pathname
const edgeFixture = new URL("../fixtures/legacy-edge", import.meta.url).pathname

function bsonDocuments(documents: Array<Record<string, unknown>>) {
  const serialized = documents.map((document) => BSON.serialize(document))
  const result = new Uint8Array(serialized.reduce((total, value) => total + value.byteLength, 0))
  let offset = 0
  for (const value of serialized) {
    result.set(value, offset)
    offset += value.byteLength
  }
  return result
}

describe("legacy source", () => {
  test("inventories and transforms the valid mounted backup", async () => {
    const source = await loadLegacySource(validFixture)
    const transformed = transformLegacySource(source)

    expect(source.inventory.collections).toMatchObject({ users: 2, posts: 3, images: 2, videos: 1 })
    expect(source.inventory.mediaFiles).toMatchObject({ images: 2, videos: 1 })
    expect(transformed.users.map((user) => user.email)).toEqual([
      "alex@example.com",
      "sam@example.com",
    ])
    const unlistedPost = transformed.posts.find((post) => post.legacyId === "d4e5f6")
    expect(unlistedPost?.visibility).toBe("unlisted")
    expect(unlistedPost?.mediaIds).toHaveLength(2)
    expect(transformed.reactions).toHaveLength(3)
  })

  test("reports collisions, missing references, and quarantine candidates", async () => {
    const source = await loadLegacySource(edgeFixture)
    const codes = new Set(source.inventory.issues.map((issue) => issue.code))

    expect(codes).toEqual(
      new Set([
        "duplicate-email",
        "duplicate-username",
        "missing-post-author",
        "missing-media-file",
        "orphan-media-record",
        "unmatched-archive-file",
      ]),
    )
  })

  test("reads concatenated mongodump BSON documents", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "pistonpost-bson-"))
    try {
      const first = BSON.serialize({ _id: "bson-user-one", email: "one@example.com" })
      const second = BSON.serialize({ _id: "bson-user-two", email: "two@example.com" })
      const combined = new Uint8Array(first.byteLength + second.byteLength)
      combined.set(first)
      combined.set(second, first.byteLength)
      await writeFile(resolve(directory, "users.bson"), combined)

      const source = await loadLegacySource(directory)

      expect(source.inventory.collections.users).toBe(2)
      expect(source.collections.users?.map((document) => document._id)).toEqual([
        "bson-user-one",
        "bson-user-two",
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("preserves the actual legacy backend BSON relationships", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "pistonpost-backend-bson-"))
    try {
      const dataDirectory = resolve(directory, "pistonpost")
      const imageDirectory = resolve(directory, "images")
      await Promise.all([
        mkdir(dataDirectory, { recursive: true }),
        mkdir(imageDirectory, { recursive: true }),
      ])
      const userId = new BSON.ObjectId("62f100000000000000000001")
      const imageId = new BSON.ObjectId("62f100000000000000000002")
      const postId = new BSON.ObjectId("62f100000000000000000003")
      const commentId = new BSON.ObjectId("62f100000000000000000004")
      const postTimestamp = Date.UTC(2022, 7, 8)
      await Promise.all([
        writeFile(
          resolve(dataDirectory, "users.bson"),
          bsonDocuments([
            {
              _id: userId,
              name: "legacy-user",
              email: "legacy@example.com",
              emailVerified: new Date(postTimestamp),
              roles: ["ADMIN"],
              settings: {
                bio: "Legacy profile",
                emailNotifications: false,
                location: "Berlin",
                theme: "business",
                website: "https://example.com",
              },
            },
          ]),
        ),
        writeFile(
          resolve(dataDirectory, "images.bson"),
          bsonDocuments([{ _id: imageId, extension: "jpeg", width: 640, height: 480 }]),
        ),
        writeFile(
          resolve(dataDirectory, "posts.bson"),
          bsonDocuments([
            {
              _id: postId,
              postId: "legacy-public-post",
              title: "Legacy image post",
              type: "IMAGES",
              imageIds: [imageId],
              author: userId,
              tags: ["furry"],
              comments: [commentId],
              likes: [userId],
              timestamp: postTimestamp,
              unlisted: false,
            },
          ]),
        ),
        writeFile(
          resolve(dataDirectory, "comments.bson"),
          bsonDocuments([{ _id: commentId, author: userId, content: "Legacy comment" }]),
        ),
        writeFile(resolve(dataDirectory, "users.metadata.json"), "{}"),
        writeFile(resolve(imageDirectory, `${imageId.toHexString()}.jpg`), "image"),
      ])

      const source = await loadLegacySource(directory)
      const transformed = transformLegacySource(source, new Set([userId.toHexString()]))

      expect(source.inventory.collections.users).toBe(1)
      expect(source.inventory.issues.filter((issue) => issue.severity === "error")).toEqual([])
      expect(transformed.issues.filter((issue) => issue.severity === "error")).toEqual([])
      expect(transformed.users[0]).toMatchObject({
        username: "legacy-user",
        role: "admin",
        bio: "Legacy profile",
        website: "https://example.com",
        location: "Berlin",
        theme: "dark",
        emailNotifications: false,
        emailVerified: true,
      })
      expect(transformed.media[0]).toMatchObject({
        ownerId: userId.toHexString(),
        filename: `${imageId.toHexString()}.jpg`,
      })
      expect(transformed.posts[0]).toMatchObject({
        id: "legacy-public-post",
        legacyId: postId.toHexString(),
        type: "images",
        createdAt: new Date(postTimestamp),
      })
      expect(transformed.comments[0]).toMatchObject({
        legacyId: commentId.toHexString(),
        postId: "legacy-public-post",
      })
      expect(transformed.reactions).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("publishes partial public galleries and drops incomplete unlisted posts", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "pistonpost-partial-gallery-"))
    try {
      const staticDirectory = resolve(directory, "static")
      await mkdir(staticDirectory, { recursive: true })
      await Promise.all([
        writeFile(
          resolve(directory, "users.json"),
          JSON.stringify([{ _id: "gallery-user", email: "gallery@example.com" }]),
        ),
        writeFile(
          resolve(directory, "images.json"),
          JSON.stringify([
            { _id: "public-available", filename: "public-available.webp" },
            { _id: "public-missing", filename: "public-missing.webp" },
            { _id: "unlisted-available", filename: "unlisted-available.webp" },
            { _id: "unlisted-missing", filename: "unlisted-missing.webp" },
            { _id: "empty-missing", filename: "empty-missing.webp" },
          ]),
        ),
        writeFile(
          resolve(directory, "videos.json"),
          JSON.stringify([
            { _id: "video-available", filename: "video-available.mp4" },
            { _id: "video-missing", filename: "video-missing.mp4" },
          ]),
        ),
        writeFile(
          resolve(directory, "posts.json"),
          JSON.stringify([
            {
              _id: "public-partial",
              authorId: "gallery-user",
              type: "images",
              imageIds: ["public-available", "public-missing"],
            },
            {
              _id: "unlisted-partial",
              authorId: "gallery-user",
              type: "images",
              unlisted: true,
              imageIds: ["unlisted-available", "unlisted-missing"],
              comments: ["unlisted-comment"],
            },
            {
              _id: "public-empty",
              authorId: "gallery-user",
              type: "images",
              imageIds: ["empty-missing"],
            },
            {
              _id: "public-partial-video",
              authorId: "gallery-user",
              type: "video",
              videoIds: ["video-available", "video-missing"],
            },
          ]),
        ),
        writeFile(
          resolve(directory, "comments.json"),
          JSON.stringify([
            { _id: "unlisted-comment", authorId: "gallery-user", content: "drop me" },
          ]),
        ),
        writeFile(resolve(staticDirectory, "public-available.webp"), "public image"),
        writeFile(resolve(staticDirectory, "unlisted-available.webp"), "unlisted image"),
        writeFile(resolve(staticDirectory, "video-available.mp4"), "video"),
      ])

      const source = await loadLegacySource(directory)
      const transformed = transformLegacySource(source)

      expect(
        source.inventory.issues
          .filter((issue) => issue.code === "missing-media-file")
          .every((issue) => issue.severity === "warning"),
      ).toBeTrue()
      expect(transformed.posts.map((post) => post.legacyId)).toEqual([
        "public-partial",
        "public-empty",
        "public-partial-video",
      ])
      expect(transformed.posts[0]).toMatchObject({
        status: "published",
        mediaIds: [expect.any(String)],
      })
      expect(transformed.posts[1]).toMatchObject({ status: "failed", mediaIds: [] })
      expect(transformed.posts[2]).toMatchObject({
        status: "failed",
        mediaIds: [expect.any(String)],
      })
      expect(transformed.media.map((media) => media.legacyId)).toEqual([
        "public-available",
        "video-available",
      ])
      expect(transformed.comments).toEqual([])
      expect(transformed.issues.map((issue) => [issue.code, issue.severity])).toEqual(
        expect.arrayContaining([
          ["partial-media-post", "warning"],
          ["dropped-unlisted-post", "warning"],
          ["dropped-unlisted-comment", "warning"],
          ["empty-media-post", "error"],
          ["incomplete-media-post", "error"],
        ]),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
