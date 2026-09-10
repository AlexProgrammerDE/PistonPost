import { describe, expect, it } from "bun:test"

import { extract as extractCloudflare } from "unpic/providers/cloudflare"
import { extract as extractCloudflareImages } from "unpic/providers/cloudflare_images"

import { getCloudflareImageTransformer } from "./image-transformer"

describe("Cloudflare image transformers", () => {
  it("resizes CDN images while preserving their existing transformation options", () => {
    const source = "/cdn-cgi/image/width=800,fit=scale-down,anim=false/art.jpg"
    const transform = getCloudflareImageTransformer(source)
    const result = transform?.(source, { width: 480, height: 320 })
    expect(result).toBeDefined()
    const extracted = result ? extractCloudflare(result) : null
    expect(extracted?.operations.width).toBe(480)
    expect(extracted?.operations.height).toBe(320)
    expect(extracted?.operations.anim).toBe(extractCloudflare(source)?.operations.anim)
    expect(extracted?.operations.fit).toBe("scale-down")
  })

  it("resizes flexible hosted Images URLs and retains the account and image identity", () => {
    for (const source of [
      "https://imagedelivery.net/account/image/w=800,fit=contain",
      "https://images.example/cdn-cgi/imagedelivery/account/image/w=800,fit=contain",
    ]) {
      const result = getCloudflareImageTransformer(source)?.(source, { width: 480 })
      expect(result).toBeDefined()
      const before = extractCloudflareImages(source)
      const after = result ? extractCloudflareImages(result) : null
      expect(after?.options).toEqual(before?.options)
      expect(after?.operations.width).toBe(480)
      expect(after?.operations.fit).toBe("contain")
    }
  })

  it("keeps same-origin hosted Images URLs relative", () => {
    const source = "/cdn-cgi/imagedelivery/account/image/w=800"
    const result = getCloudflareImageTransformer(source)?.(source, { width: 480 })
    expect(result?.startsWith("/cdn-cgi/imagedelivery/")).toBe(true)
    expect(result?.includes("pistonpost.invalid")).toBe(false)
  })

  it("leaves Worker routes, local previews, named variants, and signed URLs intact", () => {
    for (const source of [
      "/media/image/image/feed?v=1",
      "/media/external-image/post?url=source",
      "blob:https://pistonpost.test/preview",
      "data:image/png;base64,preview",
      "https://images.example/art.jpg",
      "https://imagedelivery.net/account/image/public",
      "https://imagedelivery.net/account/image/w=800?sig=signature",
      "/cdn-cgi/image/width=800/art.jpg?token=signature",
    ])
      expect(getCloudflareImageTransformer(source)).toBeUndefined()
  })
})
