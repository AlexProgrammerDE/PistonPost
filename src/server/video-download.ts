import { Effect, Schema } from "effect"

import type { MediaProviderMetadata } from "@/db/schema"

type VideoDownloadClient = Pick<StreamScopedDownloads, "generate" | "get">

const DOWNLOAD_STATUS_KEY = "streamDownloadStatus"
const DOWNLOAD_URL_KEY = "streamDownloadUrl"

type VideoDownloadStatus = "ready" | "inprogress" | "error"

export class VideoDownloadError extends Schema.TaggedError<VideoDownloadError>()(
  "VideoDownloadError",
  {
    operation: Schema.Literal("generate", "get"),
    cause: Schema.Defect,
  },
) {}

function storedDownloadStatus(metadata: MediaProviderMetadata): VideoDownloadStatus | null {
  const status = metadata[DOWNLOAD_STATUS_KEY]
  return status === "ready" || status === "inprogress" || status === "error" ? status : null
}

function cloudflareDownloadUrl(value: unknown) {
  if (typeof value !== "string" || !URL.canParse(value)) return null
  const url = new URL(value)
  if (url.protocol !== "https:") return null
  if (
    !url.hostname.endsWith(".cloudflarestream.com") &&
    !url.hostname.endsWith(".videodelivery.net")
  ) {
    return null
  }
  return url.toString()
}

export function readyVideoDownloadUrl(metadata: MediaProviderMetadata) {
  if (storedDownloadStatus(metadata) !== "ready") return null
  return cloudflareDownloadUrl(metadata[DOWNLOAD_URL_KEY])
}

function requestDownloads(client: VideoDownloadClient, operation: "generate" | "get") {
  return Effect.tryPromise({
    try: () => (operation === "generate" ? client.generate() : client.get()),
    catch: (cause) => new VideoDownloadError({ operation, cause }),
  })
}

function updateDownloadMetadata(
  metadata: MediaProviderMetadata,
  download: StreamDownload | undefined,
): MediaProviderMetadata {
  const url = cloudflareDownloadUrl(download?.url)
  const status = download?.status === "ready" && !url ? "error" : (download?.status ?? "error")
  return {
    ...metadata,
    [DOWNLOAD_STATUS_KEY]: status,
    ...(url ? { [DOWNLOAD_URL_KEY]: url } : {}),
  }
}

export const synchronizeVideoDownload = Effect.fn("synchronizeVideoDownload")(function* (
  client: VideoDownloadClient,
  metadata: MediaProviderMetadata,
) {
  if (readyVideoDownloadUrl(metadata)) return metadata

  const operation = storedDownloadStatus(metadata) === "inprogress" ? "get" : "generate"
  const downloads = yield* requestDownloads(client, operation)
  if (downloads.default || operation === "generate") {
    return updateDownloadMetadata(metadata, downloads.default)
  }

  const generated = yield* requestDownloads(client, "generate")
  return updateDownloadMetadata(metadata, generated.default)
})

export const refreshVideoDownload = Effect.fn("refreshVideoDownload")(function* (
  client: VideoDownloadClient,
  metadata: MediaProviderMetadata,
) {
  if (readyVideoDownloadUrl(metadata)) return metadata
  const downloads = yield* requestDownloads(client, "get")
  return updateDownloadMetadata(metadata, downloads.default)
})
