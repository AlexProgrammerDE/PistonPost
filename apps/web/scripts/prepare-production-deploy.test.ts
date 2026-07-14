import { describe, expect, test } from "bun:test"

import {
  prepareProductionDeployConfig,
  readProductionDeployInput,
} from "./prepare-production-deploy"

const input = {
  baseUrl: "https://post.pistonmaster.net",
  turnstileSiteKey: "production-site-key",
  d1DatabaseId: "11111111-1111-1111-1111-111111111111",
  secretsStoreId: "22222222222222222222222222222222",
}

const productionConfig = {
  name: "pistonpost-production",
  targetEnvironment: "production",
  vars: {
    APP_ENV: "production",
    PUBLIC_APP_URL: "https://post.pistonmaster.net",
    TURNSTILE_SITE_KEY: "replace-with-production-site-key",
    AUTH_EMAIL_FROM: "PistonPost Auth <auth@transactional.pistonmaster.net>",
    NOTIFICATIONS_EMAIL_FROM: "PistonPost <notifications@transactional.pistonmaster.net>",
    SUPPORT_EMAIL: "support@pistonmaster.net",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "pistonpost-production",
      migrations_dir: "../../../../packages/db/drizzle",
    },
  ],
}

describe("prepareProductionDeployConfig", () => {
  test("hydrates the generated config with production resources", () => {
    const result = prepareProductionDeployConfig(productionConfig, input)

    expect(result.workers_dev).toBeFalse()
    expect(result.routes).toEqual([{ pattern: "post.pistonmaster.net", custom_domain: true }])
    expect(result.vars).toEqual({
      APP_ENV: "production",
      PUBLIC_APP_URL: input.baseUrl,
      TURNSTILE_SITE_KEY: input.turnstileSiteKey,
      AUTH_EMAIL_FROM: "PistonPost Auth <auth@transactional.pistonmaster.net>",
      NOTIFICATIONS_EMAIL_FROM: "PistonPost <notifications@transactional.pistonmaster.net>",
      SUPPORT_EMAIL: "support@pistonmaster.net",
    })
    expect(result.d1_databases).toEqual([
      {
        binding: "DB",
        database_name: "pistonpost-production",
        migrations_dir: "../../../../packages/db/drizzle",
        database_id: input.d1DatabaseId,
      },
    ])
    expect(result.secrets_store_secrets).toEqual([
      {
        binding: "BETTER_AUTH_SECRET",
        store_id: input.secretsStoreId,
        secret_name: "BETTER_AUTH_SECRET",
      },
      {
        binding: "TURNSTILE_SECRET",
        store_id: input.secretsStoreId,
        secret_name: "TURNSTILE_SECRET",
      },
      {
        binding: "STREAM_WEBHOOK_SECRET",
        store_id: input.secretsStoreId,
        secret_name: "STREAM_WEBHOOK_SECRET",
      },
    ])
  })

  test("rejects a build that selected local bindings", () => {
    expect(() =>
      prepareProductionDeployConfig(
        { ...productionConfig, name: "pistonpost-local", targetEnvironment: undefined },
        input,
      ),
    ).toThrow("Build with CLOUDFLARE_ENV=production")
  })

  test("rejects stale production sender configuration", () => {
    expect(() =>
      prepareProductionDeployConfig(
        {
          ...productionConfig,
          vars: { ...productionConfig.vars, AUTH_EMAIL_FROM: "PistonPost <auth@example.com>" },
        },
        input,
      ),
    ).toThrow("invalid AUTH_EMAIL_FROM")
  })
})

describe("readProductionDeployInput", () => {
  test("requires a clean HTTPS production origin", () => {
    expect(() =>
      readProductionDeployInput({
        PRODUCTION_BASE_URL: "https://post.pistonmaster.net/path",
        PRODUCTION_TURNSTILE_SITE_KEY: input.turnstileSiteKey,
        PRODUCTION_D1_DATABASE_ID: input.d1DatabaseId,
        PRODUCTION_SECRETS_STORE_ID: input.secretsStoreId,
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
      }),
    ).toThrow("production Turnstile widget")
  })
})
