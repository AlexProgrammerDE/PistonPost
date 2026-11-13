import { eq } from "drizzle-orm"
import { Effect, Result, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { transitionMediaStatus } from "@/domain"
import type { AppRequestContext } from "@/server"
import { synchronizeVideoDownload } from "@/server/video-download"

import { bindingOperation } from "./operation"

const streamPayload = Schema.Struct({
  uid: Schema.String.check(Schema.isMinLength(1)),
  readyToStream: Schema.Boolean,
  status: Schema.Struct({
    state: Schema.String,
    errorReasonText: Schema.optional(Schema.String),
  }),
  duration: Schema.optional(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  size: Schema.optional(
    Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  input: Schema.optional(
    Schema.Struct({
      width: Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
      height: Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    }),
  ),
})

function decodeHex(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) return null
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16))
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
  now = Date.now(),
) {
  if (!signatureHeader) return false
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=", 2)
      return [key, value]
    }),
  )
  const time = parts.time
  const signature = parts.sig1
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

async function readSecret(secret: string | SecretsStoreSecret) {
  return typeof secret === "string" ? secret : secret.get()
}

const processStreamWebhook = Effect.fn("processStreamWebhook")(function* (
  request: Request,
  context: AppRequestContext,
) {
  const runBackgroundEffect = Effect.runPromiseWith(yield* Effect.context())
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > 64 * 1024) return new Response("Payload too large", { status: 413 })
  const body = yield* bindingOperation("processStreamWebhook", () => request.text())
  if (body.length > 64 * 1024) return new Response("Payload too large", { status: 413 })

  const secret = yield* bindingOperation("processStreamWebhook", () =>
    readSecret(context.env.STREAM_WEBHOOK_SECRET),
  )
  const valid = yield* bindingOperation("processStreamWebhook", () =>
    verifyStreamWebhook(body, request.headers.get("Webhook-Signature"), secret),
  )
  if (!valid) return new Response("Invalid signature", { status: 403 })

  const decoded = Schema.decodeResult(Schema.fromJsonString(streamPayload), {
    errors: "all",
  })(body)
  if (!Result.isSuccess(decoded)) return new Response("Invalid payload", { status: 400 })
  const payload = decoded.success
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

  const failed = payload.status.state.toLocaleLowerCase("en-US").includes("error")
  const nextStatus = payload.readyToStream ? "ready" : failed ? "failed" : "processing"
  const transition = yield* Effect.result(transitionMediaStatus(asset.status, nextStatus))
  if (Result.isFailure(transition)) return new Response("OK", { status: 200 })
  const providerMetadata = {
    ...asset.providerMetadata,
    streamState: payload.status.state,
    ...(payload.status.errorReasonText
      ? { streamError: payload.status.errorReasonText.slice(0, 200) }
      : {}),
  }
  return yield* Effect.gen(function* () {
    yield* bindingOperation("processStreamWebhook", () =>
      database
        .update(schema.mediaAssets)
        .set({
          status: transition.success,
          width: payload.input?.width,
          height: payload.input?.height,
          duration:
            payload.duration === undefined ? undefined : Math.round(payload.duration * 1000),
          byteSize: payload.size,
          finalizedAt: payload.readyToStream ? new Date() : undefined,
          providerMetadata,
        })
        .where(eq(schema.mediaAssets.id, asset.id)),
    )

    if (payload.readyToStream) {
      const generateDownload = Effect.gen(function* () {
        const downloadMetadata = yield* synchronizeVideoDownload(
          context.env.STREAM.video(payload.uid).downloads,
          providerMetadata,
        )
        yield* bindingOperation("stream-webhook.download-metadata", () =>
          database
            .update(schema.mediaAssets)
            .set({ providerMetadata: downloadMetadata })
            .where(eq(schema.mediaAssets.id, asset.id)),
        )
      }).pipe(
        Effect.catchCause(() =>
          Effect.sync(() =>
            console.error(
              JSON.stringify({
                level: "error",
                event: "stream.download-generation",
                mediaId: asset.id,
                error: "VideoDownloadError",
              }),
            ),
          ),
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
