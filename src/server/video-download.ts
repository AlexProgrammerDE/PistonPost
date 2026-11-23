import { and, eq, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Effect, Schema } from "effect"

import * as schema from "@/db/schema"
import type { MediaProviderMetadata } from "@/db/schema"

import { bindingOperation } from "./operation"
import { signStreamDeliveryUrl } from "./video-playback"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

type VideoDownloadClient = Pick<StreamScopedDownloads, "generate" | "get">

const DOWNLOAD_STATUS_KEY = "streamDownloadStatus"
const DOWNLOAD_URL_KEY = "streamDownloadUrl"

type VideoDownloadStatus = "ready" | "inprogress" | "error"

export class VideoDownloadError extends Schema.TaggedError<
  VideoDownloadError,
  { readonly brand: unique symbol }
>()("VideoDownloadError", {
  operation: Schema.Literals(["generate", "get"]),
  cause: Schema.Defect(),
}) {}

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
    catch: (cause) => VideoDownloadError.make({ operation, cause }),
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

/**
 * Stores a download state refreshed from a read path. It writes only the download keys, so other
 * metadata from a concurrent webhook or job stays intact, and it never replaces a stored ready
 * download with an older in-progress or error state.
 */
export function storeRefreshedVideoDownload(
  database: Database,
  mediaId: string,
  metadata: MediaProviderMetadata,
) {
  const status = storedDownloadStatus(metadata) ?? "error"
  const url = cloudflareDownloadUrl(metadata[DOWNLOAD_URL_KEY])
  const storedStatus = sql`json_extract(${schema.mediaAssets.providerMetadata}, '$.${sql.raw(DOWNLOAD_STATUS_KEY)}')`
  return bindingOperation("video-download.store", () =>
    database
      .update(schema.mediaAssets)
      .set({
        providerMetadata: url
          ? sql`json_set(${schema.mediaAssets.providerMetadata}, '$.${sql.raw(DOWNLOAD_STATUS_KEY)}', ${status}, '$.${sql.raw(DOWNLOAD_URL_KEY)}', ${url})`
          : sql`json_set(${schema.mediaAssets.providerMetadata}, '$.${sql.raw(DOWNLOAD_STATUS_KEY)}', ${status})`,
      })
      .where(
        and(
          eq(schema.mediaAssets.id, mediaId),
          status === "ready" ? undefined : sql`${storedStatus} is not 'ready'`,
        ),
      ),
  )
}

const STREAM_API_ORIGIN = "https://api.cloudflare.com"
const STREAM_TOKEN_TIMEOUT_MS = 10_000
// Without an `exp`, Stream expires the token one hour after it signs it.
const DOWNLOADABLE_TOKEN_REQUEST = '{"downloadable":true}'

export class VideoDownloadSigningError extends Schema.TaggedError<
  VideoDownloadSigningError,
  { readonly brand: unique symbol }
>()("VideoDownloadSigningError", {
  operation: Schema.Literals(["configure", "details", "token", "validate"]),
  status: Schema.NullOr(Schema.Finite),
  cause: Schema.optional(Schema.Defect()),
}) {}

const streamTokenResponse = Schema.Struct({
  success: Schema.Literal(true),
  result: Schema.Struct({ token: Schema.NonEmptyString }),
})

type SignVideoDownloadInput = {
  readonly downloadUrl: string
  readonly streamUid: string
  readonly details: () => Promise<Pick<StreamVideo, "requireSignedURLs">>
  readonly credentials: Effect.Effect<
    { readonly accountId: string | null; readonly apiToken: string | null },
    unknown
  >
  readonly fetch?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
}

/**
 * Creates a Stream token that allows MP4 downloads. The STREAM binding's `generateToken()` takes
 * no options and its tokens lack the `downloadable` claim, so this uses the REST `/token` endpoint.
 */
const createDownloadToken = Effect.fn("createVideoDownloadToken")(function* (input: {
  readonly accountId: string
  readonly apiToken: string
  readonly streamUid: string
  readonly fetch: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
}) {
  const endpoint = new URL(
    `/client/v4/accounts/${encodeURIComponent(input.accountId)}/stream/${encodeURIComponent(input.streamUid)}/token`,
    STREAM_API_ORIGIN,
  )
  // Call fetch unbound. Workers reject a fetch call whose receiver is another object.
  const requestFetch = input.fetch
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      requestFetch(endpoint, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(STREAM_TOKEN_TIMEOUT_MS)]),
        headers: {
          Authorization: `Bearer ${input.apiToken}`,
          "Content-Type": "application/json",
        },
        body: DOWNLOADABLE_TOKEN_REQUEST,
      }),
    catch: (cause) => VideoDownloadSigningError.make({ operation: "token", status: null, cause }),
  })
  if (!response.ok) {
    return yield* VideoDownloadSigningError.make({ operation: "token", status: response.status })
  }
  const body = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: () => VideoDownloadSigningError.make({ operation: "validate", status: response.status }),
  })
  // Drop the parse issue, because it can quote the response body and its token.
  const decoded = yield* Schema.decodeUnknownEffect(streamTokenResponse)(body).pipe(
    Effect.mapError(() =>
      VideoDownloadSigningError.make({ operation: "validate", status: response.status }),
    ),
  )
  return decoded.result.token
})

/**
 * Returns the download URL for a viewer that already passed the access check. A video that
 * requires signed URLs, because of moderation or an author ban, gets a downloadable token in place
 * of its video ID. Other videos keep the stored URL.
 */
export const signVideoDownloadUrl = Effect.fn("signVideoDownloadUrl")(function* (
  input: SignVideoDownloadInput,
) {
  const video = yield* Effect.tryPromise({
    try: () => input.details(),
    catch: (cause) => VideoDownloadSigningError.make({ operation: "details", status: null, cause }),
  })
  if (!video.requireSignedURLs) return input.downloadUrl

  const { accountId, apiToken } = yield* input.credentials.pipe(
    Effect.mapError((cause) =>
      VideoDownloadSigningError.make({ operation: "configure", status: null, cause }),
    ),
  )
  if (!accountId || !apiToken) {
    return yield* VideoDownloadSigningError.make({ operation: "configure", status: null })
  }

  const token = yield* createDownloadToken({
    accountId,
    apiToken,
    streamUid: input.streamUid,
    fetch: input.fetch ?? globalThis.fetch,
  })
  const signed = signStreamDeliveryUrl(input.downloadUrl, input.streamUid, token)
  if (!signed) {
    return yield* VideoDownloadSigningError.make({ operation: "validate", status: null })
  }
  return signed
})
