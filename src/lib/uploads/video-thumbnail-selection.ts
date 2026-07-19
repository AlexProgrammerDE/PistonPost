import { DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT } from "@/lib/video-thumbnail"

const VIDEO_THUMBNAIL_CANDIDATE_PERCENTAGES = [0.1, 0.25, 0.5, 0.7, 0.85] as const
const VIDEO_THUMBNAIL_SAMPLE_WIDTH = 160
const VIDEO_THUMBNAIL_ANALYSIS_TIMEOUT_MS = 8_000

export type VideoThumbnailFrame = {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export type VideoThumbnailCandidate = {
  readonly timestampPct: number
  readonly frame: VideoThumbnailFrame
}

export function scoreVideoThumbnailFrame({ data, width, height }: VideoThumbnailFrame) {
  const pixelCount = Math.min(Math.max(0, width * height), Math.floor(data.length / 4))
  if (pixelCount === 0 || width <= 0 || height <= 0) return 0

  const previousRow = new Float64Array(width)
  let luminanceSum = 0
  let luminanceSquaredSum = 0
  let saturationSum = 0
  let edgeSum = 0
  let edgeCount = 0
  let darkPixelCount = 0
  let lightPixelCount = 0
  let midtonePixelCount = 0

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4
    const red = data[offset] ?? 0
    const green = data[offset + 1] ?? 0
    const blue = data[offset + 2] ?? 0
    const luminance = (54 * red + 183 * green + 19 * blue) / 256
    const column = pixel % width

    luminanceSum += luminance
    luminanceSquaredSum += luminance * luminance
    saturationSum += Math.max(red, green, blue) - Math.min(red, green, blue)
    if (luminance <= 24) darkPixelCount += 1
    else if (luminance >= 240) lightPixelCount += 1
    else midtonePixelCount += 1

    if (column > 0) {
      const previousOffset = offset - 4
      const previousLuminance =
        (54 * (data[previousOffset] ?? 0) +
          183 * (data[previousOffset + 1] ?? 0) +
          19 * (data[previousOffset + 2] ?? 0)) /
        256
      edgeSum += Math.abs(luminance - previousLuminance)
      edgeCount += 1
    }
    if (pixel >= width) {
      edgeSum += Math.abs(luminance - (previousRow[column] ?? 0))
      edgeCount += 1
    }
    previousRow[column] = luminance
  }

  const meanLuminance = luminanceSum / pixelCount
  const variance = Math.max(0, luminanceSquaredSum / pixelCount - meanLuminance ** 2)
  const contrast = Math.sqrt(variance)
  const averageSaturation = saturationSum / pixelCount
  const averageEdge = edgeCount > 0 ? edgeSum / edgeCount : 0
  const darkFraction = darkPixelCount / pixelCount
  const lightFraction = lightPixelCount / pixelCount
  const midtoneFraction = midtonePixelCount / pixelCount
  const usableExposure = Math.max(0.05, 1 - darkFraction * 0.95 - lightFraction * 0.65)

  return (
    (contrast * 1.4 + averageEdge * 1.2 + averageSaturation * 0.3 + midtoneFraction * 20) *
    usableExposure
  )
}

export function selectBestVideoThumbnailCandidate(
  candidates: ReadonlyArray<VideoThumbnailCandidate>,
) {
  let bestTimestampPct = DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT
  let bestScore = Number.NEGATIVE_INFINITY

  for (const candidate of candidates) {
    const centralityPenalty = Math.abs(candidate.timestampPct - 0.5)
    const score = scoreVideoThumbnailFrame(candidate.frame) - centralityPenalty
    if (score > bestScore) {
      bestScore = score
      bestTimestampPct = candidate.timestampPct
    }
  }

  return bestTimestampPct
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "seeked",
  timeoutMs: number,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      video.removeEventListener(eventName, handleEvent)
      video.removeEventListener("error", handleError)
    }
    const handleEvent = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error("The browser could not inspect this video."))
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error("Video thumbnail analysis timed out."))
    }, timeoutMs)

    video.addEventListener(eventName, handleEvent)
    video.addEventListener("error", handleError)
  })
}

async function seekVideo(video: HTMLVideoElement, time: number, timeoutMs: number) {
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return
  const seeked = waitForVideoEvent(video, "seeked", timeoutMs)
  video.currentTime = time
  await seeked
}

export async function selectVideoThumbnailTimestamp(file: File) {
  const video = document.createElement("video")
  const objectUrl = URL.createObjectURL(file)
  const deadline = performance.now() + VIDEO_THUMBNAIL_ANALYSIS_TIMEOUT_MS

  try {
    video.preload = "auto"
    video.muted = true
    video.playsInline = true
    video.src = objectUrl
    if (video.readyState < 1) {
      await waitForVideoEvent(video, "loadedmetadata", VIDEO_THUMBNAIL_ANALYSIS_TIMEOUT_MS)
    }

    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      return DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT
    }

    const scale = Math.min(1, VIDEO_THUMBNAIL_SAMPLE_WIDTH / video.videoWidth)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT

    const candidates: VideoThumbnailCandidate[] = []
    for (const timestampPct of VIDEO_THUMBNAIL_CANDIDATE_PERCENTAGES) {
      const remainingTime = deadline - performance.now()
      if (remainingTime <= 0) break
      try {
        const time = Math.min(video.duration - 0.001, video.duration * timestampPct)
        // Frame sampling stays ordered so browsers can seek through the local file efficiently.
        // eslint-disable-next-line no-await-in-loop
        await seekVideo(video, Math.max(0, time), remainingTime)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        candidates.push({
          timestampPct,
          frame: context.getImageData(0, 0, canvas.width, canvas.height),
        })
      } catch {
        break
      }
    }

    return selectBestVideoThumbnailCandidate(candidates)
  } catch {
    return DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT
  } finally {
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}
