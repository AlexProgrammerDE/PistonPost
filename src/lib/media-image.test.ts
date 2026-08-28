import { describe, expect, it } from "bun:test"

import {
  AVATAR_IMAGE_WIDTHS,
  createManagedAvatarSrcSet,
  createMediaImageSources,
  DETAIL_IMAGE_WIDTHS,
  FEED_IMAGE_WIDTHS,
  fitMediaDimensions,
  GALLERY_THUMBNAIL_WIDTHS,
  isMediaImageVariantAllowed,
  mediaImageUrl,
  parseMediaImageAnimation,
  parseResponsiveMediaWidth,
  responsiveMediaImageMaxWidth,
  shouldPreserveMediaImageAnimation,
} from "./media-image"

describe("responsive media images", () => {
  it("accepts only the shared transformation widths", () => {
    expect(parseResponsiveMediaWidth(null)).toBeUndefined()
    expect(parseResponsiveMediaWidth("768")).toBe(768)
    expect(parseResponsiveMediaWidth("640")).toBeNull()
    expect(parseResponsiveMediaWidth("768px")).toBeNull()
  })

  it("keeps the transformation catalog intentionally small", () => {
    expect(AVATAR_IMAGE_WIDTHS).toEqual([40, 80, 160, 256])
    expect(FEED_IMAGE_WIDTHS).toEqual([480, 768, 1280])
    expect(DETAIL_IMAGE_WIDTHS).toEqual([768, 1280, 1920, 2400])
    expect(GALLERY_THUMBNAIL_WIDTHS).toEqual([96, 192, 320])
  })

  it("accepts only the still-image animation override", () => {
    expect(parseMediaImageAnimation(null)).toBe("auto")
    expect(parseMediaImageAnimation("still")).toBe("still")
    expect(parseMediaImageAnimation("animate")).toBeNull()
  })

  it("keeps responsive candidates inside each variant's bounding box", () => {
    const portrait = { width: 1200, height: 2400 }

    expect(responsiveMediaImageMaxWidth(portrait, "feed")).toBe(640)
    expect(responsiveMediaImageMaxWidth(portrait, "detail")).toBe(1200)
    expect(responsiveMediaImageMaxWidth({ width: null, height: null }, "feed")).toBe(0)
  })

  it("builds ordered candidates with dimensions that preserve the source ratio", () => {
    const sources = createMediaImageSources(
      { id: "image id", width: 1200, height: 600 },
      "feed",
      [1280, 480, 768, 480, 640],
    )

    expect(sources).toEqual([
      { src: "/media/image/image%20id/feed?v=1&width=480", width: 480, height: 240 },
      { src: "/media/image/image%20id/feed?v=1&width=768", width: 768, height: 384 },
    ])
  })

  it("builds distinct still-image URLs for reduced-motion rendering", () => {
    expect(mediaImageUrl("image id", "feed", undefined, "still")).toBe(
      "/media/image/image%20id/feed?v=1&animation=still",
    )
    expect(mediaImageUrl("image id", "feed", 480, "still")).toBe(
      "/media/image/image%20id/feed?v=1&width=480&animation=still",
    )
    expect(
      createMediaImageSources({ id: "image id", width: 640, height: 480 }, "feed", [480], "still"),
    ).toEqual([
      {
        src: "/media/image/image%20id/feed?v=1&width=480&animation=still",
        width: 480,
        height: 360,
      },
    ])
  })

  it("animates GIF content except for still-only variants and requests", () => {
    expect(shouldPreserveMediaImageAnimation("image/gif", "feed", "auto")).toBeTrue()
    expect(shouldPreserveMediaImageAnimation("image/gif", "detail", "auto")).toBeTrue()
    expect(shouldPreserveMediaImageAnimation("image/gif", "avatar", "auto")).toBeTrue()
    expect(shouldPreserveMediaImageAnimation("image/gif", "thumbnail", "auto")).toBeFalse()
    expect(shouldPreserveMediaImageAnimation("image/gif", "og", "auto")).toBeFalse()
    expect(shouldPreserveMediaImageAnimation("image/gif", "avatar", "still")).toBeFalse()
    expect(shouldPreserveMediaImageAnimation("image/png", "feed", "auto")).toBeFalse()
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
      [40, 80, 160, 256]
        .map(
          (width) =>
            `/media/image/avatar-id/avatar?v=1&width=${width.toString()} ${width.toString()}w`,
        )
        .join(", "),
    )
    expect(createManagedAvatarSrcSet("/media/image/avatar-id/avatar", "still")).toBe(
      [40, 80, 160, 256]
        .map(
          (width) =>
            `/media/image/avatar-id/avatar?v=1&width=${width.toString()}&animation=still ${width.toString()}w`,
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
