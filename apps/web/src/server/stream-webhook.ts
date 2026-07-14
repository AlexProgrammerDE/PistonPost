import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import { transitionMediaStatus } from "@pistonpost/domain"
import { eq } from "drizzle-orm"
import { Effect, Either } from "effect"
import { z } from "zod"

import type { AppRequestContext } from "@/server"

const streamPayload = z.object({
  uid: z.string().min(1),
  readyToStream: z.boolean(),
  status: z.object({
    state: z.string(),
    errorReasonText: z.string().optional(),
  }),
  duration: z.number().nonnegative().optional(),
  size: z.number().int().nonnegative().optional(),
  input: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .optional(),
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

export async function handleStreamWebhook(request: Request, context: AppRequestContext) {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > 64 * 1024) return new Response("Payload too large", { status: 413 })
  const body = await request.text()
  if (body.length > 64 * 1024) return new Response("Payload too large", { status: 413 })

  const secret = await readSecret(context.env.STREAM_WEBHOOK_SECRET)
  const valid = await verifyStreamWebhook(body, request.headers.get("Webhook-Signature"), secret)
  if (!valid) return new Response("Invalid signature", { status: 403 })

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return new Response("Invalid payload", { status: 400 })
  }
  const decoded = streamPayload.safeParse(parsed)
  if (!decoded.success) return new Response("Invalid payload", { status: 400 })
  const payload = decoded.data
  const database = createD1Database(context.env.DB)
  const asset = await database
    .select({
      id: schema.mediaAssets.id,
      status: schema.mediaAssets.status,
      providerMetadata: schema.mediaAssets.providerMetadata,
    })
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.streamUid, payload.uid))
    .get()
  if (!asset) return new Response("OK", { status: 200 })

  const failed = payload.status.state.toLocaleLowerCase("en-US").includes("error")
  const nextStatus = payload.readyToStream ? "ready" : failed ? "failed" : "processing"
  const transition = Effect.runSync(Effect.either(transitionMediaStatus(asset.status, nextStatus)))
  if (Either.isLeft(transition)) return new Response("OK", { status: 200 })
  await database
    .update(schema.mediaAssets)
    .set({
      status: transition.right,
      width: payload.input?.width,
      height: payload.input?.height,
      duration: payload.duration === undefined ? undefined : Math.round(payload.duration * 1000),
      byteSize: payload.size,
      finalizedAt: payload.readyToStream ? new Date() : undefined,
      providerMetadata: {
        ...asset.providerMetadata,
        streamState: payload.status.state,
        ...(payload.status.errorReasonText
          ? { streamError: payload.status.errorReasonText.slice(0, 200) }
          : {}),
      },
    })
    .where(eq(schema.mediaAssets.id, asset.id))

  return new Response("OK", { status: 200 })
}
