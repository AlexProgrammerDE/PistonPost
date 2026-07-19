export const DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.5
export const MIN_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.05
export const MAX_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.95
export const VIDEO_PLAYER_CACHE_VERSION = 3
export const VIDEO_THUMBNAIL_CACHE_VERSION = 4

function normalizeStreamThumbnailDimension(value: number) {
  const integer = Number.isFinite(value) ? Math.floor(value) : 2
  const positiveInteger = Math.max(2, integer)
  return positiveInteger - (positiveInteger % 2)
}

export function normalizeStreamThumbnailDimensions({
  width,
  height,
}: {
  readonly width: number
  readonly height: number
}) {
  return {
    width: normalizeStreamThumbnailDimension(width),
    height: normalizeStreamThumbnailDimension(height),
  }
}

export function resolveVideoThumbnailTimestampPct(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_VIDEO_THUMBNAIL_TIMESTAMP_PCT &&
    value <= MAX_VIDEO_THUMBNAIL_TIMESTAMP_PCT
    ? value
    : DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT
}

export function createStreamThumbnailUrl({
  source,
  durationSeconds,
  timestampPct,
  width,
  height,
}: {
  readonly source: string
  readonly durationSeconds: number
  readonly timestampPct: unknown
  readonly width: number
  readonly height: number
}) {
  const thumbnail = new URL(source)
  const dimensions = normalizeStreamThumbnailDimensions({ width, height })
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const time = durationSeconds * resolveVideoThumbnailTimestampPct(timestampPct)
    thumbnail.searchParams.set("time", `${Number(time.toFixed(3)).toString()}s`)
  }
  thumbnail.searchParams.set("width", dimensions.width.toString())
  thumbnail.searchParams.set("height", dimensions.height.toString())
  thumbnail.searchParams.set("fit", "clip")
  return thumbnail
}
