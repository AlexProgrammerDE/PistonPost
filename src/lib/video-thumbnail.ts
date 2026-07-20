export const DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.5
export const MIN_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.05
export const MAX_VIDEO_THUMBNAIL_TIMESTAMP_PCT = 0.95
export const VIDEO_PLAYER_CACHE_VERSION = 3
export const VIDEO_THUMBNAIL_CACHE_VERSION = 5

const VIDEO_PREVIEW_WIDTH = 320
const VIDEO_PREVIEW_HEIGHT = 180
const VIDEO_PREVIEW_TARGET_COUNT = 30
const VIDEO_PREVIEW_MIN_INTERVAL_SECONDS = 5

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
  timeSeconds,
  width,
  height,
}: {
  readonly source: string
  readonly durationSeconds: number
  readonly timestampPct: unknown
  readonly timeSeconds?: number
  readonly width: number
  readonly height: number
}) {
  const thumbnail = new URL(source)
  const dimensions = normalizeStreamThumbnailDimensions({ width, height })
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const maximumTime = Math.max(0, durationSeconds - 0.001)
    const time =
      Number.isFinite(timeSeconds) && timeSeconds !== undefined && timeSeconds >= 0
        ? Math.min(timeSeconds, maximumTime)
        : durationSeconds * resolveVideoThumbnailTimestampPct(timestampPct)
    thumbnail.searchParams.set("time", `${Number(time.toFixed(3)).toString()}s`)
  }
  thumbnail.searchParams.set("width", dimensions.width.toString())
  thumbnail.searchParams.set("height", dimensions.height.toString())
  thumbnail.searchParams.set("fit", "clip")
  return thumbnail
}

export function createVideoPreviewThumbnails({
  mediaId,
  durationMilliseconds,
}: {
  readonly mediaId: string
  readonly durationMilliseconds: number | null
}) {
  if (
    durationMilliseconds === null ||
    !Number.isFinite(durationMilliseconds) ||
    durationMilliseconds <= 0
  ) {
    return []
  }

  const durationSeconds = durationMilliseconds / 1_000
  const intervalSeconds = Math.max(
    VIDEO_PREVIEW_MIN_INTERVAL_SECONDS,
    Math.ceil(durationSeconds / VIDEO_PREVIEW_TARGET_COUNT),
  )
  const thumbnailCount = Math.ceil(durationSeconds / intervalSeconds)

  return Array.from({ length: thumbnailCount }, (_, index) => {
    const startTime = index * intervalSeconds
    const endTime = Math.min(durationSeconds, startTime + intervalSeconds)
    const search = new URLSearchParams({
      v: VIDEO_THUMBNAIL_CACHE_VERSION.toString(),
      time: startTime.toString(),
      width: VIDEO_PREVIEW_WIDTH.toString(),
      height: VIDEO_PREVIEW_HEIGHT.toString(),
    })

    return {
      url: `/media/video/${mediaId}/thumbnail?${search.toString()}`,
      startTime,
      endTime,
      width: VIDEO_PREVIEW_WIDTH,
      height: VIDEO_PREVIEW_HEIGHT,
    }
  })
}
