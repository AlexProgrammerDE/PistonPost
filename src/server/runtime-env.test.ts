import { describe, expect, it } from "bun:test"

import { decodeRuntimeConfig } from "./runtime-env"

describe("decodeRuntimeConfig", () => {
  it("parses the committed runtime variables", () => {
    const config = decodeRuntimeConfig({
      APP_ENV: "preview",
      BETTER_AUTH_INFRA: "enabled",
      PUBLIC_APP_URL: "https://staging.post.pistonmaster.net",
    })

    expect(config.APP_ENV).toBe("preview")
    expect(config.PUBLIC_APP_URL.hostname).toBe("staging.post.pistonmaster.net")
  })

  it("rejects malformed public URLs", () => {
    expect(() =>
      decodeRuntimeConfig({
        APP_ENV: "production",
        BETTER_AUTH_INFRA: "enabled",
        PUBLIC_APP_URL: "not a URL",
      }),
    ).toThrow()
  })

  it("requires an explicit Better Auth infrastructure state", () => {
    const base = { APP_ENV: "development", PUBLIC_APP_URL: "http://localhost:3000" }

    expect(decodeRuntimeConfig({ ...base, BETTER_AUTH_INFRA: "disabled" }).BETTER_AUTH_INFRA).toBe(
      "disabled",
    )
    expect(() => decodeRuntimeConfig(base)).toThrow()
    expect(() => decodeRuntimeConfig({ ...base, BETTER_AUTH_INFRA: "true" })).toThrow()
  })
})
