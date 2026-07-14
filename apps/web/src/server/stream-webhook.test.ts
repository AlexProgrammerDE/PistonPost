import { describe, expect, it } from "bun:test"

import { verifyStreamWebhook } from "./stream-webhook"

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
