import { describe, expect, it } from "bun:test"

import { encode } from "fast-png"

import { placeholderColorFromPng } from "./image-placeholder.server"

describe("image placeholder colors", () => {
  it("extracts the same color from RGB and opaque RGBA thumbnails", () => {
    const rgb = encode({
      width: 2,
      height: 1,
      channels: 3,
      data: new Uint8Array([80, 120, 160, 80, 120, 160]),
    })
    const rgba = encode({
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([80, 120, 160, 255, 80, 120, 160, 255]),
    })
    expect(placeholderColorFromPng(rgb)).toBe("rgb(80,120,160)")
    expect(placeholderColorFromPng(rgba)).toBe(placeholderColorFromPng(rgb))
  })

  it("omits backgrounds when any thumbnail pixel is transparent", () => {
    const png = encode({
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([80, 120, 160, 255, 80, 120, 160, 100]),
    })
    expect(placeholderColorFromPng(png)).toBeNull()
  })

  it("does not interpret sixteen-bit samples as eight-bit colors", () => {
    const png = encode({
      width: 1,
      height: 1,
      channels: 3,
      depth: 16,
      data: new Uint16Array([32768, 32768, 32768]),
    })
    expect(placeholderColorFromPng(png)).toBeNull()
  })
})
