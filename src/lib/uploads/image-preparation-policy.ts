const MAX_PRECOMPRESSED_DIMENSION = 4_096
const JPEG_PRECOMPRESSION_THRESHOLD_BYTES = 3 * 1024 * 1024

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
  const shouldTranscode =
    mimeType === "image/avif" ||
    (mimeType === "image/jpeg" && (byteSize >= JPEG_PRECOMPRESSION_THRESHOLD_BYTES || scale < 1))

  if (!shouldTranscode) return null

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    required: mimeType === "image/avif" || scale < 1,
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
