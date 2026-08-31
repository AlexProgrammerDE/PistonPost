export function canShareNatively() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
}

export async function shareNatively(data: ShareData) {
  try {
    await navigator.share(data)
    return "shared" as const
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled" as const
    throw error
  }
}

export async function prepareSharedImage(src: string, signal: AbortSignal) {
  const url = new URL(src, window.location.origin)
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/media/image/")) {
    throw new Error("This image cannot be shared as a file.")
  }
  const response = await fetch(url, { signal, cache: "no-store" })
  const mimeType = response.headers.get("content-type")?.split(";")[0]
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  }
  const extension = mimeType ? extensions[mimeType] : undefined
  if (!response.ok || !response.body || !mimeType || !extension)
    throw new Error("This image could not be loaded.")
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  while (true) {
    // Stream reads are sequential so the byte limit also bounds memory use.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 15 * 1024 * 1024) {
      void reader.cancel()
      throw new Error("This image is too large to share. Copy the post link instead.")
    }
    chunks.push(new Uint8Array(value))
  }
  const file = new File(chunks, `pistonpost-image.${extension}`, { type: mimeType })
  if (!navigator.canShare?.({ files: [file] }))
    throw new Error("This browser cannot share this image. Copy the post link instead.")
  return file
}
