import { describe, expect, mock, test } from "bun:test"

import { Effect, Exit } from "effect"

import { createStreamDirectUpload, streamUploadMetadata } from "./stream-direct-upload"

const input = {
  accountId: "0123456789abcdef0123456789abcdef",
  apiToken: "stream-token",
  byteSize: 250_000_000,
  creator: "user-1",
  filename: "weekend clip 🎉.mp4",
  expiresAt: new Date("2026-07-16T12:00:00.000Z"),
  scheduledDeletion: new Date("2026-08-16T12:00:00.000Z"),
  thumbnailTimestampPct: 0.7,
}

describe("Stream direct uploads", () => {
  test("creates a constrained direct TUS upload without exposing credentials", async () => {
    const request = mock((_: URL | RequestInfo, _init?: RequestInit) =>
      Promise.resolve(
        new Response(null, {
          status: 201,
          headers: {
            Location: "https://upload.videodelivery.net/upload-id",
            "stream-media-id": "stream-id",
          },
        }),
      ),
    )

    const result = await Effect.runPromise(createStreamDirectUpload({ ...input, fetch: request }))

    expect(result).toEqual({
      uploadUrl: "https://upload.videodelivery.net/upload-id",
      streamUid: "stream-id",
    })
    expect(request).toHaveBeenCalledTimes(1)
    const [url, init] = request.mock.calls[0] ?? []
    const requestedUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url?.url
    expect(requestedUrl).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/stream?direct_user=true`,
    )
    expect(init?.method).toBe("POST")
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${input.apiToken}`)
    expect(new Headers(init?.headers).get("Upload-Length")).toBe(input.byteSize.toString())
    expect(new Headers(init?.headers).get("Upload-Metadata")).toBe(streamUploadMetadata(input))
    expect(JSON.stringify(result)).not.toContain(input.apiToken)
  })

  test("rejects provider errors and untrusted upload locations", async () => {
    const providerFailure = await Effect.runPromiseExit(
      createStreamDirectUpload({
        ...input,
        fetch: () => Promise.resolve(new Response(null, { status: 429 })),
      }),
    )
    const untrustedLocation = await Effect.runPromiseExit(
      createStreamDirectUpload({
        ...input,
        fetch: () =>
          Promise.resolve(
            new Response(null, {
              status: 201,
              headers: { Location: "https://example.com/upload", "stream-media-id": "stream-id" },
            }),
          ),
      }),
    )

    expect(Exit.isFailure(providerFailure)).toBeTrue()
    expect(Exit.isFailure(untrustedLocation)).toBeTrue()
  })
})
