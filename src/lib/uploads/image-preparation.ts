import { normalizeImageUploadMetadata, type ImageUploadMetadata } from "./image-file-normalization"
import type { ImagePreparationWorkerResponse } from "./image-preparation.worker"
import {
  MAX_IMAGE_UPLOAD_BYTES,
  isImageUploadMimeType,
  type ImageUploadMimeType,
} from "./image-upload-policy"

const IMAGE_PREPARATION_TIMEOUT_MS = 90_000

type PendingPreparation = {
  resolve: (response: ImagePreparationWorkerResponse) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export type PreparedImageUpload = {
  file: File
  metadata: ImageUploadMetadata & { mimeType: ImageUploadMimeType }
}

export class ImagePreparationError extends Error {
  override name = "ImagePreparationError"
}

let imagePreparationWorker: Worker | null = null
const pendingPreparations = new Map<string, PendingPreparation>()
let preparationQueue = Promise.resolve()

function rejectPendingPreparations(error: Error) {
  for (const pending of pendingPreparations.values()) {
    clearTimeout(pending.timeout)
    pending.reject(error)
  }
  pendingPreparations.clear()
}

function getImagePreparationWorker() {
  if (imagePreparationWorker) return imagePreparationWorker

  const worker = new Worker(new URL("./image-preparation.worker.ts", import.meta.url), {
    type: "module",
    name: "pistonpost-image-preparation",
  })
  worker.addEventListener("message", (event: MessageEvent<ImagePreparationWorkerResponse>) => {
    const pending = pendingPreparations.get(event.data.id)
    if (!pending) return
    clearTimeout(pending.timeout)
    pendingPreparations.delete(event.data.id)
    pending.resolve(event.data)
  })
  worker.addEventListener("error", () => {
    worker.terminate()
    if (imagePreparationWorker === worker) imagePreparationWorker = null
    rejectPendingPreparations(
      new ImagePreparationError("The image cleaner stopped unexpectedly. Try again."),
    )
  })
  imagePreparationWorker = worker
  return worker
}

function runPreparation(
  bytes: ArrayBuffer,
  mimeType: ImageUploadMimeType,
): Promise<ImagePreparationWorkerResponse> {
  const id = crypto.randomUUID()
  const worker = getImagePreparationWorker()

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingPreparations.delete(id)
      reject(new ImagePreparationError("Cleaning this image took too long. Try a smaller file."))
    }, IMAGE_PREPARATION_TIMEOUT_MS)
    pendingPreparations.set(id, { resolve, reject, timeout })
    worker.postMessage({ type: "prepare", id, bytes, mimeType }, [bytes])
  })
}

function enqueuePreparation<T>(task: () => Promise<T>) {
  const result = preparationQueue.then(task, task)
  preparationQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export async function prepareImageForUpload(file: File): Promise<PreparedImageUpload> {
  if (file.size < 1 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImagePreparationError("The image must be no larger than 15 MB.")
  }

  const sourceMetadata = await normalizeImageUploadMetadata(file)
  const sourceMimeType = sourceMetadata.mimeType
  if (!isImageUploadMimeType(sourceMimeType)) {
    throw new ImagePreparationError("Choose a JPEG, PNG, GIF, WebP, or AVIF image.")
  }

  const response = await enqueuePreparation(async () => {
    const bytes = await file.arrayBuffer()
    return runPreparation(bytes, sourceMimeType)
  })
  if (response.type === "failed") {
    throw new ImagePreparationError(
      response.message || "This image could not be cleaned safely. Try exporting it again.",
    )
  }

  const preparedFile = new File([response.bytes], file.name, {
    type: response.mimeType,
    lastModified: file.lastModified,
  })
  if (preparedFile.size < 1 || preparedFile.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImagePreparationError("The cleaned image is still larger than 15 MB.")
  }

  const metadata = await normalizeImageUploadMetadata(preparedFile)
  if (!isImageUploadMimeType(metadata.mimeType)) {
    throw new ImagePreparationError("The cleaned image has an unsupported format.")
  }

  return { file: preparedFile, metadata: { ...metadata, mimeType: metadata.mimeType } }
}
