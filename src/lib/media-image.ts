export type MediaImageVariant = "avatar" | "feed" | "detail" | "thumbnail" | "og"
export type ResponsiveMediaImageVariant = "avatar" | "feed" | "detail"
export type MediaImageAnimation = "auto" | "still"

export type MediaImageDimensions = {
  readonly id: string
  readonly width: number | null
  readonly height: number | null
}

export type MediaImageSource = {
  readonly src: string
  readonly width: number
  readonly height: number
}

export const AVATAR_IMAGE_SIZE = 256
export const SOCIAL_MEDIA_IMAGE_MAX_SIZE = 1200
export const MEDIA_IMAGE_CACHE_VERSIONS: Readonly<Record<MediaImageVariant, number>> = {
  avatar: 1,
  feed: 1,
  detail: 1,
  thumbnail: 1,
  og: 2,
}

export const RESPONSIVE_MEDIA_WIDTHS: ReadonlyArray<number> = [
  32, 40, 64, 80, 96, 120, 128, 160, 192, 240, 256, 320, 480, 640, 768, 960, 1280, 1600, 1920, 2400,
]

export const AVATAR_IMAGE_WIDTHS: ReadonlyArray<number> = [
  32, 40, 64, 80, 96, 120, 128, 160, 192, 240, 256,
]
export const FEED_IMAGE_WIDTHS: ReadonlyArray<number> = [320, 480, 640, 768, 960, 1280, 1600]
export const DETAIL_IMAGE_WIDTHS: ReadonlyArray<number> = [...FEED_IMAGE_WIDTHS, 1920, 2400]
export const GALLERY_THUMBNAIL_WIDTHS: ReadonlyArray<number> = [80, 96, 160, 192, 240, 256, 320]

const responsiveMediaWidthSet: ReadonlySet<number> = new Set(RESPONSIVE_MEDIA_WIDTHS)
const managedAvatarPathPattern =
  /^\/media\/image\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/avatar$/u
const responsiveVariantLimits: Record<
  ResponsiveMediaImageVariant,
  { readonly width: number; readonly height: number }
> = {
  avatar: { width: AVATAR_IMAGE_SIZE, height: AVATAR_IMAGE_SIZE },
  feed: { width: 1280, height: 1280 },
  detail: { width: 2400, height: 2400 },
}

export function fitMediaDimensions(
  image: Pick<MediaImageDimensions, "width" | "height">,
  maximumWidth: number,
  maximumHeight: number,
) {
  if (
    !image.width ||
    !image.height ||
    image.width < 1 ||
    image.height < 1 ||
    maximumWidth < 1 ||
    maximumHeight < 1
  ) {
    return undefined
  }

  const scale = Math.min(1, maximumWidth / image.width, maximumHeight / image.height)
  return {
    width: Math.max(1, Math.floor(image.width * scale)),
    height: Math.max(1, Math.floor(image.height * scale)),
  }
}

export function mediaImageUrl(
  mediaId: string,
  variant: MediaImageVariant,
  width?: number,
  animation: MediaImageAnimation = "auto",
) {
  const path = `/media/image/${encodeURIComponent(mediaId)}/${variant}`
  const search = new URLSearchParams()
  search.set("v", MEDIA_IMAGE_CACHE_VERSIONS[variant].toString())
  if (width !== undefined) search.set("width", width.toString())
  if (animation === "still") search.set("animation", animation)
  return `${path}?${search.toString()}`
}

export function parseManagedAvatarMediaId(source: string) {
  if (!source.startsWith("/media/image/")) return undefined
  const url = new URL(source, "https://pistonpost.invalid")
  const searchKeys = Array.from(url.searchParams.keys())
  if (searchKeys.some((key) => key !== "v") || searchKeys.filter((key) => key === "v").length > 1) {
    return undefined
  }
  const version = url.searchParams.get("v")
  if (version !== null && !/^\d+$/u.test(version)) return undefined
  return managedAvatarPathPattern.exec(url.pathname)?.[1]
}

export function parseResponsiveMediaWidth(value: string | null) {
  if (value === null) return undefined
  if (!/^\d+$/u.test(value)) return null

  const width = Number(value)
  return responsiveMediaWidthSet.has(width) ? width : null
}

export function parseMediaImageAnimation(value: string | null): MediaImageAnimation | null {
  if (value === null) return "auto"
  return value === "still" ? value : null
}

export function shouldPreserveMediaImageAnimation(
  mimeType: string,
  variant: MediaImageVariant,
  animation: MediaImageAnimation,
) {
  return (
    mimeType === "image/gif" && variant !== "thumbnail" && variant !== "og" && animation !== "still"
  )
}

export function isResponsiveMediaImageVariant(
  variant: MediaImageVariant,
): variant is ResponsiveMediaImageVariant {
  return variant === "avatar" || variant === "feed" || variant === "detail"
}

export function isMediaImageVariantAllowed(
  kind: "image" | "video" | "avatar",
  variant: MediaImageVariant,
) {
  return kind === "avatar" ? variant === "avatar" : kind === "image" && variant !== "avatar"
}

export function responsiveMediaImageMaxWidth(
  image: Pick<MediaImageDimensions, "width" | "height">,
  variant: ResponsiveMediaImageVariant,
) {
  const limits = responsiveVariantLimits[variant]
  if (variant === "avatar") return limits.width
  if (!image.width || !image.height || image.width < 1 || image.height < 1) return 0

  return Math.min(
    image.width,
    limits.width,
    Math.floor((limits.height * image.width) / image.height),
  )
}

export function createMediaImageSources(
  image: MediaImageDimensions,
  variant: ResponsiveMediaImageVariant,
  widths: ReadonlyArray<number>,
  animation: MediaImageAnimation = "auto",
): ReadonlyArray<MediaImageSource> {
  const maxWidth = responsiveMediaImageMaxWidth(image, variant)
  if (maxWidth < 1 || !image.width || !image.height) return []
  const sourceWidth = image.width
  const sourceHeight = image.height

  return Array.from(new Set(widths))
    .filter((width) => responsiveMediaWidthSet.has(width) && width <= maxWidth)
    .toSorted((left, right) => left - right)
    .map((width) => ({
      src: mediaImageUrl(image.id, variant, width, animation),
      width,
      height: Math.max(1, Math.round((sourceHeight * width) / sourceWidth)),
    }))
}

export function createMediaImageSrcSet(
  image: MediaImageDimensions,
  variant: ResponsiveMediaImageVariant,
  widths: ReadonlyArray<number>,
  animation: MediaImageAnimation = "auto",
) {
  const sources = createMediaImageSources(image, variant, widths, animation)
  return sources.length > 0
    ? sources.map((source) => `${source.src} ${source.width.toString()}w`).join(", ")
    : undefined
}

export function createManagedAvatarSrcSet(source: string, animation: MediaImageAnimation = "auto") {
  if (!source.startsWith("/media/image/")) return undefined

  const url = new URL(source, "https://pistonpost.invalid")
  const match = /^\/media\/image\/([^/]+)\/avatar$/u.exec(url.pathname)
  if (!match?.[1]) return undefined
  const searchKeys = Array.from(url.searchParams.keys())
  if (searchKeys.some((key) => key !== "v")) return undefined
  let mediaId: string
  try {
    mediaId = decodeURIComponent(match[1])
  } catch {
    return undefined
  }

  return AVATAR_IMAGE_WIDTHS.map(
    (width) => `${mediaImageUrl(mediaId, "avatar", width, animation)} ${width.toString()}w`,
  ).join(", ")
}
