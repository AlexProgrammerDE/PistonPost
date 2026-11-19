import { Effect, Schema } from "effect"
import { Base64 } from "effect/encoding"

import { MAX_VIDEO_DURATION_SECONDS } from "@/lib/uploads/video-upload-policy"

const STREAM_API_ORIGIN = "https://api.cloudflare.com"
const STREAM_UPLOAD_HOSTS = new Set(["upload.cloudflarestream.com", "upload.videodelivery.net"])
const STREAM_API_TIMEOUT_MS = 15_000

export class StreamDirectUploadError extends Schema.TaggedError<
  StreamDirectUploadError,
  { readonly brand: unique symbol }
>()("StreamDirectUploadError", {
  operation: Schema.Literals(["create", "validate-response"]),
  status: Schema.NullOr(Schema.Finite),
  cause: Schema.optional(Schema.Defect()),
}) {}

export type StreamDirectUpload = {
  readonly uploadUrl: string
  readonly streamUid: string
}

type StreamDirectUploadInput = {
  readonly accountId: string
  readonly apiToken: string
  readonly byteSize: number
  readonly creator: string
  readonly filename: string
  readonly expiresAt: Date
  readonly scheduledDeletion: Date
  readonly thumbnailTimestampPct: number
  readonly fetch?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
}

/** Matches the Stream binding error for a video that no longer exists. */
export function isStreamNotFoundError(cause: unknown) {
  if (typeof cause !== "object" || cause === null) return false
  return (
    ("statusCode" in cause && cause.statusCode === 404) ||
    ("name" in cause && cause.name === "NotFoundError")
  )
}

function encodeMetadataValue(value: string) {
  return Base64.encode(value)
}

export function streamUploadMetadata({
  expiresAt,
  filename,
  scheduledDeletion,
  thumbnailTimestampPct,
}: Pick<
  StreamDirectUploadInput,
  "expiresAt" | "filename" | "scheduledDeletion" | "thumbnailTimestampPct"
>) {
  return [
    ["name", filename],
    ["maxDurationSeconds", MAX_VIDEO_DURATION_SECONDS.toString()],
    ["expiry", expiresAt.toISOString()],
    ["scheduleddeletion", scheduledDeletion.toISOString()],
    ["thumbnailtimestamppct", thumbnailTimestampPct.toString()],
  ]
    .map(([key, value]) => `${key} ${encodeMetadataValue(value ?? "")}`)
    .join(",")
}

function validUploadUrl(value: string | null) {
  if (!value || !URL.canParse(value)) return null
  const url = new URL(value)
  return url.protocol === "https:" && STREAM_UPLOAD_HOSTS.has(url.hostname) ? url.toString() : null
}

export const createStreamDirectUpload = Effect.fn("createStreamDirectUpload")(function* (
  input: StreamDirectUploadInput,
) {
  const requestFetch = input.fetch ?? globalThis.fetch
  const endpoint = new URL(
    `/client/v4/accounts/${encodeURIComponent(input.accountId)}/stream`,
    STREAM_API_ORIGIN,
  )
  endpoint.searchParams.set("direct_user", "true")

  const response = yield* Effect.tryPromise({
    try: (signal) =>
      requestFetch(endpoint, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(STREAM_API_TIMEOUT_MS)]),
        headers: {
          Authorization: `Bearer ${input.apiToken}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": input.byteSize.toString(),
          "Upload-Creator": input.creator,
          "Upload-Metadata": streamUploadMetadata(input),
        },
      }),
    catch: (cause) => StreamDirectUploadError.make({ operation: "create", status: null, cause }),
  })

  if (!response.ok) {
    return yield* StreamDirectUploadError.make({
      operation: "create",
      status: response.status,
    })
  }

  const uploadUrl = validUploadUrl(response.headers.get("location"))
  const streamUid = response.headers.get("stream-media-id")?.trim()
  if (!uploadUrl || !streamUid) {
    return yield* StreamDirectUploadError.make({
      operation: "validate-response",
      status: response.status,
    })
  }

  return { uploadUrl, streamUid } satisfies StreamDirectUpload
})
