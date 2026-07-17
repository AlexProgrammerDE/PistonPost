import { describe, expect, it } from "bun:test"

import {
  createManagedAvatarSrcSet,
  createMediaImageSources,
  fitMediaDimensions,
  isMediaImageVariantAllowed,
  parseResponsiveMediaWidth,
  responsiveMediaImageMaxWidth,
} from "./media-image"

describe("responsive media images", () => {
  it("accepts only the shared transformation widths", () => {
    expect(parseResponsiveMediaWidth(null)).toBeUndefined()
    expect(parseResponsiveMediaWidth("640")).toBe(640)
    expect(parseResponsiveMediaWidth("641")).toBeNull()
    expect(parseResponsiveMediaWidth("640px")).toBeNull()
  })

  it("keeps responsive candidates inside each variant's bounding box", () => {
    const portrait = { width: 1200, height: 2400 }

    expect(responsiveMediaImageMaxWidth(portrait, "feed")).toBe(640)
    expect(responsiveMediaImageMaxWidth(portrait, "detail")).toBe(1200)
    expect(responsiveMediaImageMaxWidth({ width: null, height: null }, "feed")).toBe(0)
  })

  it("builds ordered candidates with dimensions that preserve the source ratio", () => {
    const sources = createMediaImageSources(
      { id: "image id", width: 1200, height: 2400 },
      "feed",
      [960, 320, 640, 320, 641],
    )

    expect(sources).toEqual([
      { src: "/media/image/image%20id/feed?width=320", width: 320, height: 640 },
      { src: "/media/image/image%20id/feed?width=640", width: 640, height: 1280 },
    ])
  })

  it("fits social images inside a maximum box without cropping or upscaling", () => {
    expect(fitMediaDimensions({ width: 2400, height: 1200 }, 1200, 1200)).toEqual({
      width: 1200,
      height: 600,
    })
    expect(fitMediaDimensions({ width: 1200, height: 2400 }, 1200, 1200)).toEqual({
      width: 600,
      height: 1200,
    })
    expect(fitMediaDimensions({ width: 900, height: 700 }, 1200, 1200)).toEqual({
      width: 900,
      height: 700,
    })
    expect(fitMediaDimensions({ width: null, height: null }, 1200, 1200)).toBeUndefined()
  })

  it("adds responsive candidates only to managed avatar URLs", () => {
    expect(createManagedAvatarSrcSet("data:image/webp;base64,avatar")).toBeUndefined()
    expect(createManagedAvatarSrcSet("https://images.example/avatar.webp")).toBeUndefined()
    expect(createManagedAvatarSrcSet("/media/image/avatar-id/avatar")).toBe(
      [32, 40, 64, 80, 96, 120, 128, 160, 192, 240, 256]
        .map(
          (width) => `/media/image/avatar-id/avatar?width=${width.toString()} ${width.toString()}w`,
        )
        .join(", "),
    )
  })

  it("keeps avatar originals behind the avatar-only delivery variant", () => {
    expect(isMediaImageVariantAllowed("avatar", "avatar")).toBeTrue()
    expect(isMediaImageVariantAllowed("avatar", "detail")).toBeFalse()
    expect(isMediaImageVariantAllowed("image", "avatar")).toBeFalse()
    expect(isMediaImageVariantAllowed("image", "detail")).toBeTrue()
    expect(isMediaImageVariantAllowed("video", "thumbnail")).toBeFalse()
  })
})
