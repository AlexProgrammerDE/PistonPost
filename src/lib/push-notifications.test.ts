import { describe, expect, test } from "bun:test"

import { decodeVapidPublicKey, pushOwnership, pushSubscriptionUsesKey } from "./push-notifications"

const currentKey =
  "BOrUsnGGJlNcU2YRgSCjjnGpL4e8kN7-Lcq3H2T4yWnMtj6eBrc2yb7bU6QqeO6K0hoEJ5lRu2kcVjnKZ8f0Hmg"
const previousKey =
  "BFmQ1sUq7lDLWj2PAbJ8YwGJDp4Bj1lOYG1TjSdwEbbcS7ETpp9fUZVlj6WfcaVJpQKgnWzYQJ2ZG_jXbqI3aCk"

function subscriptionWith(key: string | null) {
  if (key === null) return { options: { applicationServerKey: null } }
  const bytes = decodeVapidPublicKey(key)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return { options: { applicationServerKey: buffer } }
}

describe("VAPID public key decoding", () => {
  test("decodes URL-safe base64 with omitted padding", () => {
    expect(Array.from(decodeVapidPublicKey("AQIDBA"))).toEqual([1, 2, 3, 4])
  })
})

describe("push subscription checks", () => {
  test("detects a subscription made with a different server key", () => {
    expect(pushSubscriptionUsesKey(subscriptionWith(currentKey), currentKey)).toBe(true)
    expect(pushSubscriptionUsesKey(subscriptionWith(previousKey), currentKey)).toBe(false)
    expect(pushSubscriptionUsesKey(subscriptionWith(null), currentKey)).toBe(false)
  })

  test("keeps push with the account that turned it on", () => {
    expect(pushOwnership("first", "first")).toBe("owned")
    expect(pushOwnership("first", "second")).toBe("other-account")
    expect(pushOwnership(null, "second")).toBe("unclaimed")
  })
})
