import initImageSanitizer, {
  sanitize_image,
} from "./image-sanitizer-wasm/pistonpost_image_sanitizer"
import imageSanitizerModule from "./image-sanitizer-wasm/pistonpost_image_sanitizer_bg.wasm?module"

const sanitizerReady = initImageSanitizer({ module_or_path: imageSanitizerModule })

function bytesEqual(first: Uint8Array, second: Uint8Array) {
  if (first.byteLength !== second.byteLength) return false
  return first.every((byte, index) => byte === second[index])
}

export async function isSanitizedImage(bytes: ArrayBuffer, mimeType: string) {
  try {
    await sanitizerReady
    const input = new Uint8Array(bytes)
    return bytesEqual(input, sanitize_image(input, mimeType))
  } catch {
    return false
  }
}
