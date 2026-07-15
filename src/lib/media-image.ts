export type MediaImageVariant = "avatar" | "feed" | "detail" | "thumbnail" | "og"
export type ResponsiveMediaImageVariant = "avatar" | "feed" | "detail"

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
const responsiveVariantLimits: Record<
  ResponsiveMediaImageVariant,
  { readonly width: number; readonly height: number }
> = {
  avatar: { width: 256, height: 256 },
  feed: { width: 1280, height: 1280 },
  detail: { width: 2400, height: 2400 },
}

export function mediaImageUrl(mediaId: string, variant: MediaImageVariant, width?: number) {
  const path = `/media/image/${encodeURIComponent(mediaId)}/${variant}`
  return width === undefined ? path : `${path}?width=${width.toString()}`
}

export function parseResponsiveMediaWidth(value: string | null) {
  if (value === null) return undefined
  if (!/^\d+$/u.test(value)) return null

  const width = Number(value)
  return responsiveMediaWidthSet.has(width) ? width : null
}

export function isResponsiveMediaImageVariant(
  variant: MediaImageVariant,
): variant is ResponsiveMediaImageVariant {
  return variant === "avatar" || variant === "feed" || variant === "detail"
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
): ReadonlyArray<MediaImageSource> {
  const maxWidth = responsiveMediaImageMaxWidth(image, variant)
  if (maxWidth < 1 || !image.width || !image.height) return []
  const sourceWidth = image.width
  const sourceHeight = image.height

  return Array.from(new Set(widths))
    .filter((width) => responsiveMediaWidthSet.has(width) && width <= maxWidth)
    .toSorted((left, right) => left - right)
    .map((width) => ({
      src: mediaImageUrl(image.id, variant, width),
      width,
      height: Math.max(1, Math.round((sourceHeight * width) / sourceWidth)),
    }))
}

export function createMediaImageSrcSet(
  image: MediaImageDimensions,
  variant: ResponsiveMediaImageVariant,
  widths: ReadonlyArray<number>,
) {
  const sources = createMediaImageSources(image, variant, widths)
  return sources.length > 0
    ? sources.map((source) => `${source.src} ${source.width.toString()}w`).join(", ")
    : undefined
}

export function createManagedAvatarSrcSet(source: string) {
  if (!source.startsWith("/media/image/")) return undefined

  const url = new URL(source, "https://pistonpost.invalid")
  if (!url.pathname.endsWith("/avatar")) return undefined

  return AVATAR_IMAGE_WIDTHS.map((width) => {
    const candidate = new URL(url)
    candidate.searchParams.set("width", width.toString())
    return `${candidate.pathname}${candidate.search} ${width.toString()}w`
  }).join(", ")
}
