import { describe, expect, it } from "bun:test"

import { Either } from "effect"
import { WebPushError } from "web-push"

import {
  classifyPushFailure,
  commentPushJob,
  decodePushDeliveryJob,
  hashPushEndpoint,
  isTrustedPushEndpoint,
  replyPushJob,
} from "@/push"

function providerFailure(statusCode: number, headers: Record<string, string> = {}) {
  return new WebPushError("provider response", statusCode, headers, "", "redacted")
}

describe("push delivery contracts", () => {
  it("creates independently idempotent jobs for each subscription", () => {
    const first = commentPushJob(
      { recipientUserId: "recipient", subscriptionId: "subscription-one" },
      "comment",
    )
    const second = commentPushJob(
      { recipientUserId: "recipient", subscriptionId: "subscription-two" },
      "comment",
    )

    expect(first.idempotencyKey).not.toBe(second.idempotencyKey)
    expect(Either.isRight(decodePushDeliveryJob(first))).toBe(true)
    const reply = replyPushJob(
      { recipientUserId: "recipient", subscriptionId: "subscription-one" },
      "comment",
    )
    const decoded = decodePushDeliveryJob({
      version: reply.version,
      type: reply.type,
      idempotencyKey: reply.idempotencyKey,
      recipientUserId: reply.recipientUserId,
      subscriptionId: reply.subscriptionId,
      commentId: reply.commentId,
      endpoint: "https://fcm.googleapis.com/a-capability",
    })
    expect(Either.isRight(decoded)).toBe(true)
    if (Either.isRight(decoded)) {
      expect(Object.hasOwn(decoded.right, "endpoint")).toBe(false)
    }
  })

  it("accepts known browser push services and rejects arbitrary destinations", () => {
    expect(isTrustedPushEndpoint("https://fcm.googleapis.com/fcm/send/example")).toBe(true)
    expect(
      isTrustedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example"),
    ).toBe(true)
    expect(isTrustedPushEndpoint("https://web.push.apple.com/QP/example")).toBe(true)
    expect(isTrustedPushEndpoint("https://wns2-am3p.notify.windows.com/w/?token=example")).toBe(
      true,
    )
    expect(isTrustedPushEndpoint("https://example.com/push")).toBe(false)
    expect(isTrustedPushEndpoint("http://fcm.googleapis.com/push")).toBe(false)
    expect(isTrustedPushEndpoint("https://fcm.googleapis.com:8443/push")).toBe(false)
  })

  it("hashes endpoint capabilities without preserving the endpoint", async () => {
    const first = await hashPushEndpoint("https://fcm.googleapis.com/fcm/send/first")
    const second = await hashPushEndpoint("https://fcm.googleapis.com/fcm/send/second")

    expect(first).toHaveLength(64)
    expect(first).not.toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it("separates expired, rate-limited, terminal, and retryable provider failures", () => {
    expect(classifyPushFailure(providerFailure(410))._tag).toBe("PushSubscriptionExpired")
    expect(classifyPushFailure(providerFailure(429, { "retry-after": "120" }))).toMatchObject({
      _tag: "PushRateLimited",
      retryAfterSeconds: 120,
    })
    expect(classifyPushFailure(providerFailure(403))).toMatchObject({
      _tag: "PushDeliveryError",
      retryable: false,
    })
    expect(classifyPushFailure(providerFailure(503))).toMatchObject({
      _tag: "PushDeliveryError",
      retryable: true,
    })
  })
})
