import { describe, expect, test } from "bun:test"

import { readJpegDimensions } from "./jpeg-inspection"

function segment(marker: number, payload: readonly number[]) {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

function frameHeader(marker: number, width: number, height: number) {
  return segment(marker, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0])
}

function jpeg(...parts: readonly (readonly number[])[]) {
  return Uint8Array.from([0xff, 0xd8, ...parts.flat()])
}

describe("JPEG inspection", () => {
  test("reads the declared frame size after metadata segments", () => {
    const exif = segment(0xe1, [...new TextEncoder().encode("Exif\0\0"), 1, 2, 3])
    expect(readJpegDimensions(jpeg(exif, frameHeader(0xc0, 2001, 1000)))).toEqual({
      width: 2001,
      height: 1000,
    })
  })

  test("reads progressive and arithmetic frame headers", () => {
    expect(readJpegDimensions(jpeg(frameHeader(0xc2, 65_500, 1221)))).toEqual({
      width: 65_500,
      height: 1221,
    })
    expect(readJpegDimensions(jpeg(frameHeader(0xc9, 4000, 3000)))).toEqual({
      width: 4000,
      height: 3000,
    })
  })

  test("skips fill bytes and Huffman tables before the frame header", () => {
    const huffman = segment(0xc4, [0, ...Array.from({ length: 16 }, () => 0)])
    expect(readJpegDimensions(jpeg([0xff], huffman, frameHeader(0xc1, 3, 2)))).toEqual({
      width: 3,
      height: 2,
    })
  })

  test("returns null when the header has no complete frame", () => {
    expect(readJpegDimensions(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(readJpegDimensions(jpeg(segment(0xda, [0])))).toBeNull()
    expect(readJpegDimensions(jpeg(frameHeader(0xc0, 10, 10)).slice(0, 8))).toBeNull()
    expect(readJpegDimensions(jpeg([0x00, 0x01]))).toBeNull()
  })
})
