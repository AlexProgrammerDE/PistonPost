import type { ImageUploadMimeType } from "./image-upload-policy"

const SIGNATURE_BYTES = 512

const canonicalExtensions: Readonly<Record<ImageUploadMimeType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
}

function bytesMatch(bytes: Uint8Array, offset: number, expected: readonly number[]) {
  if (bytes.length < offset + expected.length) return false
  return expected.every((value, index) => bytes[offset + index] === value)
}

function asciiMatches(bytes: Uint8Array, offset: number, expected: string) {
  if (bytes.length < offset + expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false
  }
  return true
}

function isAvif(bytes: Uint8Array) {
  if (bytes.length < 16 || !asciiMatches(bytes, 4, "ftyp")) return false

  const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  if (boxSize < 16) return false

  const brandLimit = Math.min(bytes.length, boxSize)
  if (asciiMatches(bytes, 8, "avif") || asciiMatches(bytes, 8, "avis")) return true

  for (let offset = 16; offset + 4 <= brandLimit; offset += 4) {
    if (asciiMatches(bytes, offset, "avif") || asciiMatches(bytes, offset, "avis")) return true
  }

  return false
}

function detectImageMimeType(bytes: Uint8Array): ImageUploadMimeType | null {
  if (bytesMatch(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (bytesMatch(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (asciiMatches(bytes, 0, "GIF87a") || asciiMatches(bytes, 0, "GIF89a")) return "image/gif"
  if (asciiMatches(bytes, 0, "RIFF") && asciiMatches(bytes, 8, "WEBP")) return "image/webp"
  if (isAvif(bytes)) return "image/avif"
  return null
}

function filenameForMimeType(originalName: string, mimeType: ImageUploadMimeType) {
  const currentExtension = originalName.split(".").pop()?.toLocaleLowerCase("en-US")
  if (
    currentExtension === canonicalExtensions[mimeType] ||
    (mimeType === "image/jpeg" && currentExtension === "jpeg")
  ) {
    return originalName
  }

  const lastDot = originalName.lastIndexOf(".")
  const stem = lastDot > 0 ? originalName.slice(0, lastDot) : originalName
  return `${stem || "image"}.${canonicalExtensions[mimeType]}`
}

export type ImageUploadMetadata = {
  filename: string
  mimeType: string
}

export async function normalizeImageUploadMetadata(file: File): Promise<ImageUploadMetadata> {
  const bytes = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer())
  const detectedMimeType = detectImageMimeType(bytes)

  if (!detectedMimeType) {
    return { filename: file.name, mimeType: file.type }
  }

  return {
    filename: filenameForMimeType(file.name, detectedMimeType),
    mimeType: detectedMimeType,
  }
}
