export const DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.5
export const MIN_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.05
export const MAX_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.95

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
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const time = durationSeconds * resolveVideoThumbnailTimestampPct(timestampPct)
    thumbnail.searchParams.set("time", `${Number(time.toFixed(3)).toString()}s`)
  }
  thumbnail.searchParams.set("width", width.toString())
  thumbnail.searchParams.set("height", height.toString())
  thumbnail.searchParams.set("fit", "clip")
  return thumbnail
}
