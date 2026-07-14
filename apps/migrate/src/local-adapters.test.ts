import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { LocalObjectWriter, LocalVideoWriter } from "./local-adapters"

describe("local migration adapters", () => {
  test("keeps duplicate video content under distinct deterministic Stream IDs", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "pistonpost-local-video-"))
    try {
      const firstPath = resolve(directory, "first.mp4")
      const secondPath = resolve(directory, "second.mp4")
      await Promise.all([writeFile(firstPath, "video"), writeFile(secondPath, "video")])
      const writer = new LocalVideoWriter(new LocalObjectWriter(resolve(directory, "objects")))
      const checksum = new Bun.CryptoHasher("sha256").update("video").digest("hex")

      const first = await writer.upload(firstPath, checksum, "legacy-user")
      const second = await writer.upload(secondPath, checksum, "legacy-user")

      expect(first.uid).not.toBe(second.uid)
      expect(await writer.upload(firstPath, checksum, "legacy-user")).toEqual(first)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
