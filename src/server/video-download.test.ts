import { describe, expect, test } from "bun:test"

import { Effect, Result } from "effect"

import {
  readyVideoDownloadUrl,
  refreshVideoDownload,
  signVideoDownloadUrl,
  synchronizeVideoDownload,
} from "./video-download"

const downloadUrl = "https://customer-example.cloudflarestream.com/video-one/downloads/default.mp4"

describe("Stream video downloads", () => {
  test("generates an MP4 when a ready video has no download", async () => {
    let generated = 0
    const metadata = await Effect.runPromise(
      synchronizeVideoDownload(
        {
          generate: () => {
            generated += 1
            return Promise.resolve({
              default: { status: "ready", percentComplete: 100, url: downloadUrl },
            })
          },
          get: () => Promise.resolve({}),
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
          generate: () => {
            generated += 1
            return Promise.resolve({})
          },
          get: () => {
            retrieved += 1
            return Promise.resolve({
              default: { status: "ready", percentComplete: 100, url: downloadUrl },
            })
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
          generate: () => Promise.reject(new Error("generate should not be called")),
          get: () => {
            retrieved += 1
            return Promise.resolve({
              default: { status: "inprogress", percentComplete: 75, url: downloadUrl },
            })
          },
        },
        {},
      ),
    )

    expect(retrieved).toBe(1)
    expect(metadata["streamDownloadStatus"]).toBe("inprogress")
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

type FetchCall = { url: string; init: RequestInit | undefined }

function stubFetch(response: () => Response) {
  const calls: FetchCall[] = []
  const fetch = (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      init,
    })
    return Promise.resolve(response())
  }
  return { calls, fetch }
}

function sign({
  requireSignedURLs,
  fetch,
  accountId = "account/one",
}: {
  requireSignedURLs: boolean
  fetch: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
  accountId?: string | null
}) {
  return Effect.runPromise(
    Effect.result(
      signVideoDownloadUrl({
        downloadUrl,
        streamUid: "video-one",
        details: () => Promise.resolve({ requireSignedURLs }),
        credentials: Effect.succeed({ accountId, apiToken: "api-token" }),
        fetch,
      }),
    ),
  )
}

describe("signed video downloads", () => {
  test("keeps the stored URL when the video does not require signed URLs", async () => {
    const stub = stubFetch(() => Response.json({}))
    const result = await sign({ requireSignedURLs: false, fetch: stub.fetch })

    expect(Result.isSuccess(result) && result.success).toBe(downloadUrl)
    expect(stub.calls).toHaveLength(0)
  })

  test("requests a downloadable token and puts it in place of the video ID", async () => {
    const stub = stubFetch(() =>
      Response.json({ success: true, errors: [], messages: [], result: { token: "signed.jwt" } }),
    )
    const result = await sign({ requireSignedURLs: true, fetch: stub.fetch })

    expect(Result.isSuccess(result) && result.success).toBe(
      "https://customer-example.cloudflarestream.com/signed.jwt/downloads/default.mp4",
    )
    expect(stub.calls).toHaveLength(1)
    const [call] = stub.calls
    expect(call?.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account%2Fone/stream/video-one/token",
    )
    expect(call?.init?.method).toBe("POST")
    expect(new Headers(call?.init?.headers).get("Authorization")).toBe("Bearer api-token")
    expect(call?.init?.body).toBe('{"downloadable":true}')
  })

  test("fails with the status when Stream rejects the token request", async () => {
    const stub = stubFetch(() => Response.json({ success: false }, { status: 403 }))
    const result = await sign({ requireSignedURLs: true, fetch: stub.fetch })

    expect(Result.isFailure(result) && result.failure.operation).toBe("token")
    expect(Result.isFailure(result) && result.failure.status).toBe(403)
  })

  test("fails when Stream returns a body without a token", async () => {
    const stub = stubFetch(() => Response.json({ success: true, result: {} }))
    const result = await sign({ requireSignedURLs: true, fetch: stub.fetch })

    expect(Result.isFailure(result) && result.failure.operation).toBe("validate")
  })

  test("fails when the network request fails", async () => {
    const result = await sign({
      requireSignedURLs: true,
      fetch: () => Promise.reject(new TypeError("network down")),
    })

    expect(Result.isFailure(result) && result.failure.operation).toBe("token")
    expect(Result.isFailure(result) && result.failure.status).toBeNull()
  })

  test("fails without calling Stream when the API credentials are missing", async () => {
    const stub = stubFetch(() => Response.json({}))
    const result = await sign({ requireSignedURLs: true, fetch: stub.fetch, accountId: null })

    expect(Result.isFailure(result) && result.failure.operation).toBe("configure")
    expect(stub.calls).toHaveLength(0)
  })
})
