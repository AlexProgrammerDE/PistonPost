import { describe, expect, it } from "bun:test"

import { decodeStreamWebhookPayload, verifyStreamWebhook } from "./stream-webhook"

async function signature(body: string, time: number, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${time.toString()}.${body}`)),
  )
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `time=${time.toString()},sig1=${hex}`
}

describe("Stream webhook verification", () => {
  it("accepts an intact, recent body", async () => {
    const now = Date.now()
    const time = Math.floor(now / 1000)
    const body = '{"uid":"video-one","readyToStream":true}'
    const header = await signature(body, time, "webhook-secret")

    expect(await verifyStreamWebhook(body, header, "webhook-secret", now)).toBeTrue()
  })

  it("rejects changed bodies and stale timestamps", async () => {
    const now = Date.now()
    const staleTime = Math.floor((now - 10 * 60 * 1000) / 1000)
    const body = '{"uid":"video-one"}'
    const currentHeader = await signature(body, Math.floor(now / 1000), "webhook-secret")
    const staleHeader = await signature(body, staleTime, "webhook-secret")

    expect(await verifyStreamWebhook(`${body}\n`, currentHeader, "webhook-secret", now)).toBeFalse()
    expect(await verifyStreamWebhook(body, staleHeader, "webhook-secret", now)).toBeFalse()
  })
})

describe("Stream webhook payload", () => {
  it("records duration, size, and dimensions from a ready video", () => {
    const body = JSON.stringify({
      uid: "video-one",
      readyToStream: true,
      status: { state: "ready" },
      duration: 5.5,
      size: 383_631,
      input: { width: 560, height: 320 },
    })

    expect(decodeStreamWebhookPayload(body)).toEqual({
      uid: "video-one",
      readyToStream: true,
      state: "ready",
      errorReasonText: undefined,
      durationMilliseconds: 5500,
      byteSize: 383_631,
      width: 560,
      height: 320,
    })
  })

  it("accepts an error notification whose duration and dimensions are still unknown", () => {
    // Stream sends -1 for a duration or input dimension that it could not read.
    const body = JSON.stringify({
      uid: "video-one",
      readyToStream: false,
      status: { state: "error", errorReasonText: "The file is not a video." },
      duration: -1,
      size: 1024,
      input: { width: -1, height: -1 },
    })

    expect(decodeStreamWebhookPayload(body)).toEqual({
      uid: "video-one",
      readyToStream: false,
      state: "error",
      errorReasonText: "The file is not a video.",
      durationMilliseconds: undefined,
      byteSize: 1024,
      width: undefined,
      height: undefined,
    })
  })

  it("rejects malformed bodies", () => {
    expect(decodeStreamWebhookPayload("{")).toBeNull()
    expect(decodeStreamWebhookPayload(JSON.stringify({ uid: "", readyToStream: true }))).toBeNull()
  })
})
