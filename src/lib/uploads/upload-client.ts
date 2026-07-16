import { DetailedError, Upload } from "tus-js-client"

export type VideoUploadProtocol = "multipart" | "tus"

export class UploadClientError extends Error {
  override name = "UploadClientError"
}

function rejectedUploadMessage(kind: "image" | "video", status: number) {
  if (status === 400) {
    return kind === "image"
      ? "This image did not match its file type or could not be validated."
      : "Cloudflare could not accept this video. Check its format and 10-minute limit."
  }
  if (status === 413) {
    return kind === "image" ? "This image is larger than 15 MB." : "This video is larger than 2 GB."
  }
  if (status === 429) return "Too many uploads were started at once. Wait a minute and try again."
  return `The ${kind} upload was rejected. Try again.`
}

function responseError(kind: "image" | "video", status: number, body: string) {
  if (kind === "image") {
    try {
      const value: unknown = JSON.parse(body)
      if (value && typeof value === "object" && "error" in value) {
        const error = value.error
        if (
          error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ) {
          return new UploadClientError(error.message)
        }
      }
    } catch {
      // Use the status-based message for non-JSON responses.
    }
  }
  return new UploadClientError(rejectedUploadMessage(kind, status))
}

export function uploadImage(
  uploadUrl: string,
  file: File,
  onProgress: (percentage: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("PUT", uploadUrl)
    request.setRequestHeader("Content-Type", file.type)
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name))
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
    })
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(responseError("image", request.status, request.responseText))
    })
    request.addEventListener("error", () =>
      reject(new UploadClientError("The image upload was interrupted. Try again.")),
    )
    request.addEventListener("abort", () =>
      reject(new UploadClientError("The image upload was cancelled.")),
    )
    signal?.addEventListener("abort", () => request.abort(), { once: true })
    request.send(file)
  })
}

export function uploadVideo(
  uploadUrl: string,
  protocol: VideoUploadProtocol,
  file: File,
  onProgress: (percentage: number) => void,
  signal?: AbortSignal,
) {
  if (protocol === "multipart") {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      const form = new FormData()
      form.append("file", file, file.name)
      request.open("POST", uploadUrl)
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
      })
      request.addEventListener("load", () => {
        if (request.status >= 200 && request.status < 300) resolve()
        else reject(responseError("video", request.status, request.responseText))
      })
      request.addEventListener("error", () =>
        reject(new UploadClientError("The video upload was interrupted. Try again.")),
      )
      request.addEventListener("abort", () =>
        reject(new UploadClientError("The video upload was cancelled.")),
      )
      signal?.addEventListener("abort", () => request.abort(), { once: true })
      request.send(form)
    })
  }

  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      uploadUrl,
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      metadata: { filename: file.name, filetype: file.type },
      onError: (error) => {
        const status =
          error instanceof DetailedError ? (error.originalResponse?.getStatus() ?? null) : null
        reject(
          status === null
            ? new UploadClientError("The video upload was interrupted. Try again.")
            : responseError("video", status, ""),
        )
      },
      onProgress: (uploaded, total) => onProgress(total > 0 ? (uploaded / total) * 100 : 0),
      onSuccess: () => resolve(),
    })
    signal?.addEventListener(
      "abort",
      () => {
        void upload
          .abort(true)
          .finally(() => reject(new UploadClientError("The video upload was cancelled.")))
      },
      { once: true },
    )
    upload.start()
  })
}
