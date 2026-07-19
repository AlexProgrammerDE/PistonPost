import { describe, expect, it } from "bun:test"

import { missingStaticAssetResponse } from "./static-assets"

describe("missingStaticAssetResponse", () => {
  it("returns a non-cacheable response for missing asset paths", async () => {
    const response = missingStaticAssetResponse(
      new Request("https://post.pistonmaster.net/assets/missing.js"),
    )

    expect(response?.status).toBe(404)
    expect(response?.headers.get("Cache-Control")).toBe("no-store")
    expect(response?.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(await response?.text()).toBe("Asset not found.")
  })

  it("does not intercept application routes", () => {
    expect(
      missingStaticAssetResponse(new Request("https://post.pistonmaster.net/account/posts/new")),
    ).toBeNull()
  })

  it("omits the body for HEAD requests", async () => {
    const response = missingStaticAssetResponse(
      new Request("https://post.pistonmaster.net/assets/missing.css", { method: "HEAD" }),
    )

    expect(response?.status).toBe(404)
    expect(response?.headers.get("Cache-Control")).toBe("no-store")
    expect(await response?.text()).toBe("")
  })
})
