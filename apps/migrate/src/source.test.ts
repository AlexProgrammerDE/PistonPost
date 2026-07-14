import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { BSON } from "bson"

import { loadLegacySource } from "./source"
import { transformLegacySource } from "./transform"

const validFixture = new URL("../fixtures/legacy-valid", import.meta.url).pathname
const edgeFixture = new URL("../fixtures/legacy-edge", import.meta.url).pathname

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
})
