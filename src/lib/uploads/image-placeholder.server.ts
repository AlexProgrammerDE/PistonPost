import { getDominantColor, rgbColorToCssString } from "@unpic/placeholder"
import { decode } from "fast-png"

// Only decode the tiny PNG produced by Images, never the full user upload.
export async function createImagePlaceholder(images: ImagesBinding, bytes: ArrayBuffer) {
  const thumbnail = await images
    .input(new Blob([bytes]).stream())
    .transform({ width: 16, height: 16, fit: "scale-down" })
    .output({ format: "image/png", anim: false })
  return placeholderColorFromPng(await thumbnail.response().arrayBuffer())
}

export function placeholderColorFromPng(bytes: ArrayBuffer | Uint8Array) {
  const png = decode(bytes)
  if (png.depth !== 8 || png.palette || png.transparency) return null
  if (png.channels !== 3 && png.channels !== 4) return null

  const pixels = new Uint8ClampedArray(png.width * png.height * 4)
  for (let index = 0; index < png.width * png.height; index++) {
    const offset = index * png.channels
    const red = png.data[offset]
    const green = png.data[offset + 1]
    const blue = png.data[offset + 2]
    const alpha = png.channels === 4 ? png.data[offset + 3] : 255
    if (red === undefined || green === undefined || blue === undefined || alpha !== 255) return null
    pixels.set([red, green, blue, alpha], index * 4)
  }
  return rgbColorToCssString(getDominantColor(pixels))
}
