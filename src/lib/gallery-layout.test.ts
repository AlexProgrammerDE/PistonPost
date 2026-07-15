import { describe, expect, it } from "bun:test"

import { resolveGalleryLayout } from "./gallery-layout"

describe("gallery layout", () => {
  it("uses masonry by default and the browser for explicit image links", () => {
    expect(resolveGalleryLayout(undefined, undefined)).toBe("masonry")
    expect(resolveGalleryLayout(undefined, 2)).toBe("browser")
  })

  it("lets an explicit layout override the image-link default", () => {
    expect(resolveGalleryLayout("masonry", 2)).toBe("masonry")
    expect(resolveGalleryLayout("browser", undefined)).toBe("browser")
  })
})
