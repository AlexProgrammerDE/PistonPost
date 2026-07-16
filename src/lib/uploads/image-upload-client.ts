export class UploadClientError extends Error {
  override name = "UploadClientError"
}

function rejectedUploadMessage(status: number) {
  if (status === 400) return "This image did not match its file type or could not be validated."
  if (status === 413) return "This image is larger than 15 MB."
  if (status === 429) return "Too many uploads were started at once. Wait a minute and try again."
  return "The image upload was rejected. Try again."
}

function responseError(status: number, body: string) {
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
  return new UploadClientError(rejectedUploadMessage(status))
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
      else reject(responseError(request.status, request.responseText))
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
