export const MAX_GIF_ANIMATION_PIXELS = 50_000_000

export type GifInspection = {
  readonly frameCount: number
  readonly height: number
  readonly totalPixels: number
  readonly width: number
}

export function isGifAnimationWithinPixelLimit(inspection: GifInspection) {
  return inspection.frameCount < 2 || inspection.totalPixels <= MAX_GIF_ANIMATION_PIXELS
}

function asciiMatches(bytes: Uint8Array, offset: number, expected: string) {
  if (bytes.length < offset + expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false
  }
  return true
}

function readUint16(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 2) return null
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function colorTableBytes(packed: number) {
  return 3 * 2 ** ((packed & 0b111) + 1)
}

function skipSubBlocks(bytes: Uint8Array, start: number) {
  let offset = start
  while (offset < bytes.length) {
    const blockSize = bytes[offset]
    offset += 1
    if (blockSize === 0) return offset
    if (offset + blockSize > bytes.length) return null
    offset += blockSize
  }
  return null
}

export function inspectGif(bytes: Uint8Array): GifInspection | null {
  if (!asciiMatches(bytes, 0, "GIF87a") && !asciiMatches(bytes, 0, "GIF89a")) return null

  const width = readUint16(bytes, 6)
  const height = readUint16(bytes, 8)
  const packed = bytes[10]
  if (width === null || height === null || packed === undefined || width < 1 || height < 1) {
    return null
  }

  let offset = 13
  if ((packed & 0b1000_0000) !== 0) offset += colorTableBytes(packed)
  if (offset > bytes.length) return null

  let frameCount = 0
  while (offset < bytes.length) {
    const marker = bytes[offset]
    offset += 1

    if (marker === 0x3b) {
      if (frameCount < 1) return null
      return {
        frameCount,
        height,
        totalPixels: width * height * frameCount,
        width,
      }
    }

    if (marker === 0x21) {
      if (offset >= bytes.length) return null
      offset += 1
      const nextOffset = skipSubBlocks(bytes, offset)
      if (nextOffset === null) return null
      offset = nextOffset
      continue
    }

    if (marker !== 0x2c || offset + 9 > bytes.length) return null

    const left = readUint16(bytes, offset)
    const top = readUint16(bytes, offset + 2)
    const frameWidth = readUint16(bytes, offset + 4)
    const frameHeight = readUint16(bytes, offset + 6)
    const framePacked = bytes[offset + 8]
    if (
      left === null ||
      top === null ||
      frameWidth === null ||
      frameHeight === null ||
      framePacked === undefined ||
      frameWidth < 1 ||
      frameHeight < 1 ||
      left + frameWidth > width ||
      top + frameHeight > height
    ) {
      return null
    }

    offset += 9
    if ((framePacked & 0b1000_0000) !== 0) offset += colorTableBytes(framePacked)
    if (offset >= bytes.length) return null

    const minimumCodeSize = bytes[offset]
    if (minimumCodeSize === undefined || minimumCodeSize < 2 || minimumCodeSize > 8) return null
    offset += 1

    const nextOffset = skipSubBlocks(bytes, offset)
    if (nextOffset === null) return null
    offset = nextOffset
    frameCount += 1
  }

  return null
}
