import { MAX_IMAGE_PIXELS, MAX_JPEG_PIXELS } from "./image-upload-policy"
import type { ImageDimensions } from "./jpeg-inspection"

const MAX_PRECOMPRESSED_DIMENSION = 4096
const JPEG_PRECOMPRESSION_THRESHOLD_BYTES = 3 * 1024 * 1024

export type ImagePreparationStrategy = "sanitize" | "transcode" | "too-large"

/**
 * Chooses how the browser prepares an image. JPEGs above the sanitizer's pixel limit are
 * converted to WebP from the original file instead, because the sanitizer would reject them.
 */
export function imagePreparationStrategy(
  mimeType: string,
  dimensions: ImageDimensions | null,
): ImagePreparationStrategy {
  if (mimeType === "image/avif") return "transcode"
  if (mimeType !== "image/jpeg" || !dimensions) return "sanitize"
  const pixels = dimensions.width * dimensions.height
  if (pixels > MAX_IMAGE_PIXELS) return "too-large"
  return pixels > MAX_JPEG_PIXELS ? "transcode" : "sanitize"
}

export type ImageTranscodePlan = {
  width: number
  height: number
  required: boolean
}

export function imageTranscodePlan({
  mimeType,
  byteSize,
  width,
  height,
}: {
  mimeType: string
  byteSize: number
  width: number
  height: number
}): ImageTranscodePlan | null {
  const longestEdge = Math.max(width, height)
  const scale = Math.min(1, MAX_PRECOMPRESSED_DIMENSION / longestEdge)
  const required =
    imagePreparationStrategy(mimeType, { width, height }) === "transcode" ||
    (mimeType === "image/jpeg" && scale < 1)
  const shouldTranscode =
    required || (mimeType === "image/jpeg" && byteSize >= JPEG_PRECOMPRESSION_THRESHOLD_BYTES)

  if (!shouldTranscode) return null

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    required,
  }
}

export function shouldUseImageTranscode({
  sourceByteSize,
  transcodedByteSize,
  required,
}: {
  sourceByteSize: number
  transcodedByteSize: number
  required: boolean
}) {
  return required || transcodedByteSize < sourceByteSize * 0.95
}
