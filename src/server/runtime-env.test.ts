import { describe, expect, it } from "bun:test"

import { decodeRuntimeConfig } from "./runtime-env"

describe("decodeRuntimeConfig", () => {
  it("parses the committed runtime variables", () => {
    const config = decodeRuntimeConfig({
      APP_ENV: "preview",
      PUBLIC_APP_URL: "https://staging.post.pistonmaster.net",
    })

    expect(config.APP_ENV).toBe("preview")
    expect(config.PUBLIC_APP_URL.hostname).toBe("staging.post.pistonmaster.net")
  })

  it("rejects malformed public URLs", () => {
    expect(() =>
      decodeRuntimeConfig({ APP_ENV: "production", PUBLIC_APP_URL: "not a URL" }),
    ).toThrow()
  })
})
