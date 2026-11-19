export type ImageDimensions = {
  readonly width: number
  readonly height: number
}

function isStartOfFrame(marker: number) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function isStandalone(marker: number) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
}

function readUint16(bytes: Uint8Array, offset: number) {
  const high = bytes[offset]
  const low = bytes[offset + 1]
  if (high === undefined || low === undefined) return null
  return (high << 8) | low
}

/** Reads the frame size from a JPEG header without decoding the image. */
export function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    // Any number of 0xFF fill bytes can come before a marker code.
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null
    offset += 1
    if (isStandalone(marker)) continue

    const length = readUint16(bytes, offset)
    if (length === null || length < 2) return null
    if (isStartOfFrame(marker)) {
      const height = readUint16(bytes, offset + 3)
      const width = readUint16(bytes, offset + 5)
      if (height === null || width === null) return null
      return { width, height }
    }
    offset += length
  }

  return null
}
