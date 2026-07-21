import { describe, expect, it } from "bun:test"

import { decodeVapidPublicKey } from "./push-notifications"

describe("VAPID public key decoding", () => {
  it("decodes URL-safe base64 with omitted padding", () => {
    expect(Array.from(decodeVapidPublicKey("AQIDBA"))).toEqual([1, 2, 3, 4])
  })
})
