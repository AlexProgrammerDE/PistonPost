import { describe, expect, test } from "bun:test"

import {
  cloudflareApiError,
  cloudflareR2BaseUrl,
  cloudflareR2ClientOptions,
} from "./cloudflare-adapters"

describe("Cloudflare migration adapters", () => {
  test("uses the EU endpoint for jurisdictional R2 buckets", () => {
    expect(cloudflareR2BaseUrl("account-id", "migration-media")).toBe(
      "https://account-id.eu.r2.cloudflarestorage.com/migration-media",
    )
  })

  test("passes temporary credential session tokens to the S3 client", () => {
    expect(cloudflareR2ClientOptions("access", "secret", "session")).toEqual({
      accessKeyId: "access",
      secretAccessKey: "secret",
      sessionToken: "session",
    })
  })

  test("extracts sanitized Cloudflare API error messages", () => {
    expect(cloudflareApiError({ errors: [{ message: "Invalid batch request." }] })).toBe(
      "Invalid batch request.",
    )
    expect(cloudflareApiError(null)).toBe("Unknown Cloudflare API error.")
  })
})
