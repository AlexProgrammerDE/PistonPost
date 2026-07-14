import { Upload } from "tus-js-client"

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
      else reject(new Error(request.responseText || "The image upload was rejected."))
    })
    request.addEventListener("error", () => reject(new Error("The image upload was interrupted.")))
    request.addEventListener("abort", () => reject(new Error("The image upload was cancelled.")))
    signal?.addEventListener("abort", () => request.abort(), { once: true })
    request.send(file)
  })
}

export function uploadVideo(
  uploadUrl: string,
  file: File,
  onProgress: (percentage: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      uploadUrl,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      removeFingerprintOnSuccess: true,
      metadata: { filename: file.name, filetype: file.type },
      onError: (error) => reject(error),
      onProgress: (uploaded, total) => onProgress(total > 0 ? (uploaded / total) * 100 : 0),
      onSuccess: () => resolve(),
    })
    signal?.addEventListener(
      "abort",
      () => {
        void upload.abort(true).finally(() => reject(new Error("The video upload was cancelled.")))
      },
      { once: true },
    )
    void upload.findPreviousUploads().then((previousUploads) => {
      const previous = previousUploads[0]
      if (previous) upload.resumeFromPreviousUpload(previous)
      upload.start()
    }, reject)
  })
}
