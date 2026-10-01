import { describe, expect, test } from "bun:test"

import { readProductionDeployInput } from "./production-config"

const input = {
  baseUrl: "https://post.pistonmaster.net",
  turnstileSiteKey: "production-site-key",
  d1DatabaseId: "11111111-1111-1111-1111-111111111111",
  secretsStoreId: "22222222222222222222222222222222",
  vapidPublicKey: "B".repeat(87),
}

describe("readProductionDeployInput", () => {
  test("requires a clean HTTPS production origin", () => {
    expect(() =>
      readProductionDeployInput({
        PRODUCTION_BASE_URL: "https://post.pistonmaster.net/path",
        PRODUCTION_TURNSTILE_SITE_KEY: input.turnstileSiteKey,
        PRODUCTION_D1_DATABASE_ID: input.d1DatabaseId,
        PRODUCTION_SECRETS_STORE_ID: input.secretsStoreId,
        PRODUCTION_VAPID_PUBLIC_KEY: input.vapidPublicKey,
      }),
    ).toThrow("HTTPS origin")
  })

  test("rejects a different HTTPS production origin", () => {
    expect(() =>
      readProductionDeployInput({
        PRODUCTION_BASE_URL: "https://example.com",
        PRODUCTION_TURNSTILE_SITE_KEY: input.turnstileSiteKey,
        PRODUCTION_D1_DATABASE_ID: input.d1DatabaseId,
        PRODUCTION_SECRETS_STORE_ID: input.secretsStoreId,
        PRODUCTION_VAPID_PUBLIC_KEY: input.vapidPublicKey,
      }),
    ).toThrow("must be https://post.pistonmaster.net")
  })

  test("rejects the committed Turnstile placeholder", () => {
    expect(() =>
      readProductionDeployInput({
        PRODUCTION_BASE_URL: input.baseUrl,
        PRODUCTION_TURNSTILE_SITE_KEY: "replace-with-production-site-key",
        PRODUCTION_D1_DATABASE_ID: input.d1DatabaseId,
        PRODUCTION_SECRETS_STORE_ID: input.secretsStoreId,
        PRODUCTION_VAPID_PUBLIC_KEY: input.vapidPublicKey,
      }),
    ).toThrow("production Turnstile widget")
  })
})
