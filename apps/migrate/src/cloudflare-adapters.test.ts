import { describe, expect, test } from "bun:test"

import { cloudflareR2BaseUrl } from "./cloudflare-adapters"

describe("Cloudflare migration adapters", () => {
  test("uses the EU endpoint for jurisdictional R2 buckets", () => {
    expect(cloudflareR2BaseUrl("account-id", "migration-media")).toBe(
      "https://account-id.eu.r2.cloudflarestorage.com/migration-media",
    )
  })
})
