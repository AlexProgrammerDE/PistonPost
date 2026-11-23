import { and, eq, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Clock, DateTime, Effect, Result, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { transitionMediaStatus, type MediaStatus } from "@/domain/media-state"
import type { AppRequestContext } from "@/server"
import { logError } from "@/server/error-log"
import { storeRefreshedVideoDownload, synchronizeVideoDownload } from "@/server/video-download"

import { bindingOperation } from "./operation"

/** Stream reports `-1` for a duration or input dimension that it does not know yet. */
const streamMeasurement = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(-1))
const streamInteger = streamMeasurement.check(Schema.isInt())

const streamPayload = Schema.Struct({
  uid: Schema.String.check(Schema.isMinLength(1)),
  readyToStream: Schema.Boolean,
  status: Schema.Struct({
    state: Schema.String,
    errorReasonText: Schema.optional(Schema.String),
  }),
  duration: Schema.optional(streamMeasurement),
  size: Schema.optional(
    Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  input: Schema.optional(Schema.Struct({ width: streamInteger, height: streamInteger })),
})

/** Parses a webhook body. Unknown values become undefined so they never overwrite stored data. */
export function decodeStreamWebhookPayload(body: string) {
  const decoded = Schema.decodeResult(Schema.fromJsonString(streamPayload), {
    errors: "all",
  })(body)
  if (!Result.isSuccess(decoded)) return null
  const { uid, readyToStream, status, duration, size, input } = decoded.success
  const dimensions = input && input.width > 0 && input.height > 0 ? input : undefined
  return {
    uid,
    readyToStream,
    state: status.state,
    errorReasonText: status.errorReasonText,
    durationMilliseconds:
      duration === undefined || duration < 0 ? undefined : Math.round(duration * 1000),
    byteSize: size,
    width: dimensions?.width,
    height: dimensions?.height,
  }
}

function decodeHex(value: string) {
  if (!/^[a-f0-9]+$/iu.test(value) || value.length % 2 !== 0) return null
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], (part) => Number.parseInt(part, 16))
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

export async function verifyStreamWebhook(
  body: string,
  signatureHeader: string | null,
  secret: string,
  now: number,
) {
  if (!signatureHeader) return false
  const parts = new Map(
    signatureHeader.split(",").map((part): [string, string | undefined] => {
      const [key = "", value] = part.split("=", 2)
      return [key, value]
    }),
  )
  const time = parts.get("time")
  const signature = parts.get("sig1")
  const timestamp = Number(time)
  if (!time || !signature || !Number.isSafeInteger(timestamp)) return false
  if (Math.abs(now - timestamp * 1000) > 5 * 60 * 1000) return false

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${time}.${body}`)),
  )
  const received = decodeHex(signature)
  return received !== null && constantTimeEqual(expected, received)
}

type StreamWebhookPayload = NonNullable<ReturnType<typeof decodeStreamWebhookPayload>>

/** Stores a webhook's result if the asset still has the status the webhook checked. */
export function storeStreamWebhookState(
  database: BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>,
  asset: Readonly<{ id: string; status: MediaStatus }>,
  payload: StreamWebhookPayload,
  status: MediaStatus,
  finalizedAt: Date | undefined,
) {
  const streamError = payload.errorReasonText?.slice(0, 200)
  return bindingOperation("processStreamWebhook", () =>
    database
      .update(schema.mediaAssets)
      .set({
        status,
        width: payload.width,
        height: payload.height,
        duration: payload.durationMilliseconds,
        byteSize: payload.byteSize,
        finalizedAt,
        // Set only the Stream keys, so a download link written meanwhile is kept.
        providerMetadata: streamError
          ? sql`json_set(${schema.mediaAssets.providerMetadata}, '$.streamState', ${payload.state}, '$.streamError', ${streamError})`
          : sql`json_set(${schema.mediaAssets.providerMetadata}, '$.streamState', ${payload.state})`,
      })
      // Cleanup can delete the asset after the webhook read it. Apply only to the checked status.
      .where(and(eq(schema.mediaAssets.id, asset.id), eq(schema.mediaAssets.status, asset.status)))
      .returning({ providerMetadata: schema.mediaAssets.providerMetadata }),
  )
}

async function readSecret(secret: string | SecretsStoreSecret) {
  return typeof secret === "string" ? secret : secret.get()
}

const processStreamWebhook = Effect.fn("processStreamWebhook")(function* (
  request: Request,
  context: AppRequestContext,
) {
  const effectContext = yield* Effect.context()
  const runBackgroundEffect = Effect.runPromiseWith(effectContext)
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > 64 * 1024) return new Response("Payload too large", { status: 413 })
  const body = yield* bindingOperation("processStreamWebhook", () => request.text())
  if (body.length > 64 * 1024) return new Response("Payload too large", { status: 413 })

  const secret = yield* bindingOperation("processStreamWebhook", () =>
    readSecret(context.env.STREAM_WEBHOOK_SECRET),
  )
  const now = yield* Clock.currentTimeMillis
  const valid = yield* bindingOperation("processStreamWebhook", () =>
    verifyStreamWebhook(body, request.headers.get("Webhook-Signature"), secret, now),
  )
  if (!valid) return new Response("Invalid signature", { status: 403 })

  const payload = decodeStreamWebhookPayload(body)
  if (!payload) return new Response("Invalid payload", { status: 400 })
  const database = createD1Database(context.env.DB)
  const asset = yield* bindingOperation("processStreamWebhook", () =>
    database
      .select({
        id: schema.mediaAssets.id,
        status: schema.mediaAssets.status,
        providerMetadata: schema.mediaAssets.providerMetadata,
      })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.streamUid, payload.uid))
      .get(),
  )
  if (!asset) return new Response("OK", { status: 200 })

  const failed = payload.state.toLocaleLowerCase("en-US").includes("error")
  const nextStatus = payload.readyToStream ? "ready" : failed ? "failed" : "processing"
  const transition = yield* Effect.result(transitionMediaStatus(asset.status, nextStatus))
  if (Result.isFailure(transition)) return new Response("OK", { status: 200 })
  return yield* Effect.gen(function* () {
    const finalizedAt = payload.readyToStream ? yield* DateTime.nowAsDate : undefined
    const updated = yield* storeStreamWebhookState(
      database,
      asset,
      payload,
      transition.success,
      finalizedAt,
    )
    const row = updated[0]
    if (!row) return new Response("OK", { status: 200 })

    if (payload.readyToStream) {
      const generateDownload = Effect.gen(function* () {
        const downloadMetadata = yield* synchronizeVideoDownload(
          context.env.STREAM.video(payload.uid).downloads,
          row.providerMetadata,
        )
        yield* storeRefreshedVideoDownload(database, asset.id, downloadMetadata)
      }).pipe(
        Effect.catchCause(() =>
          Effect.sync(() => {
            logError("stream.download-generation", {
              mediaId: asset.id,
              error: "VideoDownloadError",
            })
          }),
        ),
      )
      context.executionContext.waitUntil(runBackgroundEffect(generateDownload))
    }

    return new Response("OK", { status: 200 })
  }).pipe(Effect.uninterruptible)
})

export function handleStreamWebhook(request: Request, context: AppRequestContext) {
  return Effect.runPromise(processStreamWebhook(request, context), { signal: request.signal })
}
