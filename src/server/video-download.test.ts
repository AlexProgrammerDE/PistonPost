import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import {
  readyVideoDownloadUrl,
  refreshVideoDownload,
  synchronizeVideoDownload,
} from "./video-download"

const downloadUrl = "https://customer-example.cloudflarestream.com/video-one/downloads/default.mp4"

describe("Stream video downloads", () => {
  test("generates an MP4 when a ready video has no download", async () => {
    let generated = 0
    const metadata = await Effect.runPromise(
      synchronizeVideoDownload(
        {
          generate: async () => {
            generated += 1
            return {
              default: { status: "ready", percentComplete: 100, url: downloadUrl },
            }
          },
          get: async () => ({}),
        },
        {},
      ),
    )

    expect(generated).toBe(1)
    expect(readyVideoDownloadUrl(metadata)).toBe(downloadUrl)
  })

  test("polls an in-progress download without generating it again", async () => {
    let generated = 0
    let retrieved = 0
    const metadata = await Effect.runPromise(
      synchronizeVideoDownload(
        {
          generate: async () => {
            generated += 1
            return {}
          },
          get: async () => {
            retrieved += 1
            return {
              default: { status: "ready", percentComplete: 100, url: downloadUrl },
            }
          },
        },
        { streamDownloadStatus: "inprogress" },
      ),
    )

    expect(generated).toBe(0)
    expect(retrieved).toBe(1)
    expect(readyVideoDownloadUrl(metadata)).toBe(downloadUrl)
  })

  test("refreshes provider state without creating a download from a read path", async () => {
    let retrieved = 0
    const metadata = await Effect.runPromise(
      refreshVideoDownload(
        {
          generate: async () => {
            throw new Error("generate should not be called")
          },
          get: async () => {
            retrieved += 1
            return {
              default: { status: "inprogress", percentComplete: 75, url: downloadUrl },
            }
          },
        },
        {},
      ),
    )

    expect(retrieved).toBe(1)
    expect(metadata.streamDownloadStatus).toBe("inprogress")
    expect(readyVideoDownloadUrl(metadata)).toBeNull()
  })

  test("does not redirect to an untrusted provider URL", () => {
    expect(
      readyVideoDownloadUrl({
        streamDownloadStatus: "ready",
        streamDownloadUrl: "https://example.com/video.mp4",
      }),
    ).toBeNull()
  })
})
