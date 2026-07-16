export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024

export const IMAGE_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const

export type ImageUploadMimeType = (typeof IMAGE_UPLOAD_MIME_TYPES)[number]

export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_MIME_TYPES.join(",")

const imageUploadMimeTypes: ReadonlySet<string> = new Set(IMAGE_UPLOAD_MIME_TYPES)
const extensionsByMime: ReadonlyMap<ImageUploadMimeType, ReadonlySet<string>> = new Map([
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
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
