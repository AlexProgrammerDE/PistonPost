export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024
export const MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE = 20

export const IMAGE_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const

export type ImageUploadMimeType = (typeof IMAGE_UPLOAD_MIME_TYPES)[number]

// The upload route runs the WASM sanitizer in a Worker with a 128 MB memory limit. At these limits
// the measured peak stays near 96 MB. The Rust sanitizer enforces the same numbers.
// JPEG keeps every DCT coefficient in memory, so the browser converts larger JPEGs to WebP.
export const MAX_JPEG_PIXELS = 2_000_000
export const MAX_GIF_PIXELS = 8_000_000
export const MAX_IMAGE_PIXELS = 80_000_000

export function maxImagePixels(mimeType: ImageUploadMimeType) {
  if (mimeType === "image/jpeg") return MAX_JPEG_PIXELS
  if (mimeType === "image/gif") return MAX_GIF_PIXELS
  return MAX_IMAGE_PIXELS
}

export function isWithinImagePixelLimit(
  mimeType: ImageUploadMimeType,
  width: number,
  height: number,
) {
  const pixels = width * height
  return pixels > 0 && pixels <= maxImagePixels(mimeType)
}

export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_MIME_TYPES.join(",")

export function createImageUploadBatches<T>(files: readonly T[]) {
  const batches: T[][] = []
  for (let offset = 0; offset < files.length; offset += MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE) {
    batches.push(files.slice(offset, offset + MAX_IMAGE_UPLOAD_INTENT_BATCH_SIZE))
  }
  return batches
}

const imageUploadMimeTypes: ReadonlySet<string> = new Set(IMAGE_UPLOAD_MIME_TYPES)
const extensionsByMime: ReadonlyMap<ImageUploadMimeType, ReadonlySet<string>> = new Map([
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/gif", new Set(["gif"])],
  ["image/webp", new Set(["webp"])],
  ["image/avif", new Set(["avif"])],
])

export function isImageUploadMimeType(value: string): value is ImageUploadMimeType {
  return imageUploadMimeTypes.has(value)
}

export function imageFilenameMatchesMime(filename: string, mimeType: ImageUploadMimeType) {
  const extension = filename.split(".").pop()?.toLocaleLowerCase("en-US")
  return extension ? extensionsByMime.get(mimeType)?.has(extension) === true : false
}
