import { UploadClientError } from "./image-upload-client"

type VideoAssetStatus = { readonly status: string } | undefined

const VIDEO_PROCESSING_ATTEMPTS = 120
const VIDEO_PROCESSING_INTERVAL_MS = 5000

function cancelledError() {
  return new UploadClientError("The video upload was cancelled.")
}

function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) throw cancelledError()
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(cancelledError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, milliseconds)
    signal.addEventListener("abort", abort, { once: true })
  })
}

/**
 * Polls an uploaded video until Stream finishes processing it. Aborting the signal stops the wait,
 * so a video the author cancelled while it processed is never posted.
 */
export async function waitForVideoProcessing(
  readStatus: () => Promise<VideoAssetStatus>,
  signal: AbortSignal,
  { attempts = VIDEO_PROCESSING_ATTEMPTS, intervalMs = VIDEO_PROCESSING_INTERVAL_MS } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfCancelled(signal)
    // Polling must remain ordered so each check observes the latest Stream state.
    const asset = await readStatus()
    throwIfCancelled(signal)
    if (asset?.status === "ready") return
    if (asset?.status === "failed" || asset?.status === "deleted") {
      throw new Error("The video could not be processed.")
    }
    // The delay is part of the bounded reconciliation protocol.
    await delay(intervalMs, signal)
  }
  throw new Error("The video is still processing. Try posting again in a few minutes.")
}
