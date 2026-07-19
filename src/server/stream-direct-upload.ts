import { Effect, Schema } from "effect"

const STREAM_API_ORIGIN = "https://api.cloudflare.com"
const STREAM_UPLOAD_HOSTS = new Set(["upload.cloudflarestream.com", "upload.videodelivery.net"])

export class StreamDirectUploadError extends Schema.TaggedError<StreamDirectUploadError>()(
  "StreamDirectUploadError",
  {
    operation: Schema.Literal("create", "validate-response"),
    status: Schema.NullOr(Schema.Number),
    cause: Schema.optional(Schema.Defect),
  },
) {}

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
  readonly allowedOrigin: string
  readonly expiresAt: Date
  readonly scheduledDeletion: Date
  readonly thumbnailTimestampPct: number
  readonly fetch?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
}

function encodeMetadataValue(value: string) {
  const bytes = new TextEncoder().encode(value)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  return btoa(binary)
}

export function streamUploadMetadata({
  allowedOrigin,
  expiresAt,
  filename,
  scheduledDeletion,
  thumbnailTimestampPct,
}: Pick<
  StreamDirectUploadInput,
  "allowedOrigin" | "expiresAt" | "filename" | "scheduledDeletion" | "thumbnailTimestampPct"
>) {
  const hostname = new URL(allowedOrigin).hostname
  return [
    ["name", filename],
    ["maxDurationSeconds", "600"],
    ["expiry", expiresAt.toISOString()],
    ["allowedorigins", hostname],
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
    try: () =>
      requestFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiToken}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": input.byteSize.toString(),
          "Upload-Creator": input.creator,
          "Upload-Metadata": streamUploadMetadata(input),
        },
      }),
    catch: (cause) => new StreamDirectUploadError({ operation: "create", status: null, cause }),
  })

  if (!response.ok) {
    return yield* new StreamDirectUploadError({
      operation: "create",
      status: response.status,
    })
  }

  const uploadUrl = validUploadUrl(response.headers.get("location"))
  const streamUid = response.headers.get("stream-media-id")?.trim()
  if (!uploadUrl || !streamUid) {
    return yield* new StreamDirectUploadError({
      operation: "validate-response",
      status: response.status,
    })
  }

  return { uploadUrl, streamUid } satisfies StreamDirectUpload
})
