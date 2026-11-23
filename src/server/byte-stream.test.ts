import { describe, expect, it } from "bun:test"

import { byteStream } from "./byte-stream"

function streamOf(chunks: readonly unknown[]) {
  return new ReadableStream<unknown>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe("byteStream", () => {
  it("passes byte chunks through unchanged", async () => {
    const body = byteStream(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]))

    expect(Array.from(await new Response(body).bytes())).toEqual([1, 2, 3])
  })

  it("errors the stream when a chunk is not bytes", async () => {
    const body = byteStream(streamOf([new Uint8Array([1]), "text"]))

    const failure = await new Response(body).bytes().then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(TypeError)
    expect(failure).toHaveProperty("message", "Stream chunk is not a byte array.")
  })
})
