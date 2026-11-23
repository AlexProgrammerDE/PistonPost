import { describe, expect, test } from "bun:test"

import { waitForVideoProcessing } from "./video-processing"

function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : "Unknown error"),
  )
}

describe("waitForVideoProcessing", () => {
  test("resolves once the video is ready", async () => {
    const statuses = ["processing", "processing", "ready"]
    let checks = 0
    await waitForVideoProcessing(
      () => Promise.resolve({ status: statuses[checks++] ?? "processing" }),
      new AbortController().signal,
      { intervalMs: 1 },
    )

    expect(checks).toBe(3)
  })

  test("fails when processing fails", async () => {
    const result = waitForVideoProcessing(
      () => Promise.resolve({ status: "failed" }),
      new AbortController().signal,
      { intervalMs: 1 },
    )

    expect(await rejection(result)).toBe("The video could not be processed.")
  })

  test("stops waiting when the upload is cancelled during processing", async () => {
    const controller = new AbortController()
    let checks = 0
    const result = waitForVideoProcessing(
      () => {
        checks += 1
        return Promise.resolve({ status: "processing" })
      },
      controller.signal,
      { intervalMs: 60_000 },
    )
    await Promise.resolve()
    controller.abort()

    expect(await rejection(result)).toBe("The video upload was cancelled.")
    expect(checks).toBe(1)
  })

  test("does not report a video ready after it was cancelled", async () => {
    const controller = new AbortController()
    const result = waitForVideoProcessing(() => {
      // Stream finishes while the author cancels the upload.
      controller.abort()
      return Promise.resolve({ status: "ready" })
    }, controller.signal)

    expect(await rejection(result)).toBe("The video upload was cancelled.")
  })
})
