/// <reference lib="webworker" />

import {
  imagePreparationStrategy,
  imageTranscodePlan,
  shouldUseImageTranscode,
} from "./image-preparation-policy"
import initImageSanitizer, {
  sanitize_image,
} from "./image-sanitizer-wasm/pistonpost_image_sanitizer"
import type { ImageUploadMimeType } from "./image-upload-policy"
import { readJpegDimensions } from "./jpeg-inspection"

export type PrepareImageRequest = {
  type: "prepare"
  id: string
  bytes: ArrayBuffer
  mimeType: ImageUploadMimeType
}

type PrepareImageSuccess = {
  type: "prepared"
  id: string
  bytes: ArrayBuffer
  mimeType: ImageUploadMimeType
}

type PrepareImageFailure = {
  type: "failed"
  id: string
  message: string
}

// This module is bundled only as a dedicated worker. The project-wide DOM lib otherwise types
// `globalThis` as Window, so narrow the environment at this explicit worker boundary.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope
const sanitizerReady = initImageSanitizer()

function exactArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function transcodeToWebp(
  bytes: Uint8Array,
  sourceMimeType: ImageUploadMimeType,
  sourceByteSize: number,
) {
  if (sourceMimeType !== "image/jpeg" && sourceMimeType !== "image/avif") return null

  const blob = new Blob([exactArrayBuffer(bytes)], { type: sourceMimeType })
  // Bake EXIF orientation into the pixels. The WebP output has no metadata to carry it.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" })

  try {
    const plan = imageTranscodePlan({
      mimeType: sourceMimeType,
      byteSize: sourceByteSize,
      width: bitmap.width,
      height: bitmap.height,
    })
    if (!plan) return null

    const canvas = new OffscreenCanvas(plan.width, plan.height)
    const context = canvas.getContext("2d", { alpha: true })
    if (!context) throw new Error("Canvas rendering is unavailable.")
    context.drawImage(bitmap, 0, 0, plan.width, plan.height)
    const output = await canvas.convertToBlob({ type: "image/webp", quality: 0.88 })

    if (
      !shouldUseImageTranscode({
        sourceByteSize: bytes.byteLength,
        transcodedByteSize: output.size,
        required: plan.required,
      })
    ) {
      return null
    }

    return new Uint8Array(await output.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

async function prepareImage(request: PrepareImageRequest): Promise<PrepareImageSuccess> {
  const input = new Uint8Array(request.bytes)
  const strategy = imagePreparationStrategy(
    request.mimeType,
    request.mimeType === "image/jpeg" ? readJpegDimensions(input) : null,
  )

  if (strategy === "too-large") {
    throw new Error("The image must be no larger than 80 megapixels.")
  }
  if (strategy === "transcode") {
    const transcoded = await transcodeToWebp(
      input,
      request.mimeType,
      request.bytes.byteLength,
    ).catch(() => null)
    if (!transcoded) {
      throw new Error(
        request.mimeType === "image/avif"
          ? "This browser could not convert the AVIF image."
          : "This browser could not convert the large JPEG image.",
      )
    }
    return {
      type: "prepared",
      id: request.id,
      bytes: exactArrayBuffer(transcoded),
      mimeType: "image/webp",
    }
  }

  await sanitizerReady
  const sanitized = sanitize_image(input, request.mimeType)
  const transcoded = await transcodeToWebp(
    sanitized,
    request.mimeType,
    request.bytes.byteLength,
  ).catch(() => null)
  const output = transcoded ?? sanitized

  return {
    type: "prepared",
    id: request.id,
    bytes: exactArrayBuffer(output),
    mimeType: transcoded ? "image/webp" : request.mimeType,
  }
}

async function respond(request: PrepareImageRequest) {
  try {
    const response = await prepareImage(request)
    workerScope.postMessage(response, [response.bytes])
  } catch (error: unknown) {
    const response: PrepareImageFailure = {
      type: "failed",
      id: request.id,
      message: error instanceof Error ? error.message : "Image preparation failed.",
    }
    // WorkerGlobalScope.postMessage has no target origin because it cannot navigate.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    workerScope.postMessage(response)
  }
}

workerScope.addEventListener("message", (event: MessageEvent<PrepareImageRequest>) => {
  void respond(event.data)
})

export type ImagePreparationWorkerResponse = PrepareImageSuccess | PrepareImageFailure
