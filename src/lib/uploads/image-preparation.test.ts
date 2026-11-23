import { afterAll, beforeAll, describe, expect, jest, test } from "bun:test"

import { prepareImageForUpload } from "./image-preparation"
import type {
  ImagePreparationWorkerResponse,
  PrepareImageRequest,
} from "./image-preparation.worker"

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
])

type MessageListener = (event: MessageEvent<ImagePreparationWorkerResponse>) => void

class FakeWorker {
  static readonly instances: FakeWorker[] = []
  // The first worker hangs on every request, like a cleaner stuck on a hostile image.
  readonly hangs = FakeWorker.instances.length === 0
  terminated = false
  requests = 0
  readonly #listeners: MessageListener[] = []

  constructor() {
    FakeWorker.instances.push(this)
  }

  addEventListener(type: string, listener: MessageListener) {
    if (type === "message") this.#listeners.push(listener)
  }

  postMessage(request: PrepareImageRequest) {
    this.requests += 1
    if (this.hangs || this.terminated) return
    const response: ImagePreparationWorkerResponse = {
      type: "prepared",
      id: request.id,
      bytes: PNG_BYTES.slice().buffer,
      mimeType: "image/png",
    }
    queueMicrotask(() => {
      for (const listener of this.#listeners)
        listener(new MessageEvent("message", { data: response }))
    })
  }

  terminate() {
    this.terminated = true
  }
}

const originalWorker = globalThis.Worker

beforeAll(() => {
  // @ts-expect-error The fake implements only the members image preparation uses.
  globalThis.Worker = FakeWorker
  jest.useFakeTimers()
})

afterAll(() => {
  jest.useRealTimers()
  globalThis.Worker = originalWorker
})

function pngFile(name: string) {
  return new File([PNG_BYTES], name, { type: "image/png" })
}

async function settle<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

describe("prepareImageForUpload", () => {
  test("replaces a timed-out cleaner so later images do not wait behind it", async () => {
    const stuck = settle(prepareImageForUpload(pngFile("stuck.png")))
    // Let the request reach the worker before its timeout starts counting.
    for (let turn = 0; turn < 1000 && (FakeWorker.instances[0]?.requests ?? 0) === 0; turn += 1)
      await Promise.resolve()
    expect(FakeWorker.instances[0]?.requests).toBe(1)
    jest.advanceTimersByTime(90_000)

    const stuckResult = await stuck
    expect(stuckResult.ok).toBe(false)
    expect(FakeWorker.instances[0]?.terminated).toBe(true)

    const next = await settle(prepareImageForUpload(pngFile("next.png")))
    expect(next.ok).toBe(true)
    expect(next.ok && next.value.file.name).toBe("next.png")
  })
})
