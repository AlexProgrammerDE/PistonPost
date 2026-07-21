import { Context, Effect, Layer, Schema } from "effect"
import * as webPush from "web-push"

import { isTrustedPushEndpoint } from "./subscription"

export type PushNotificationPayload = Readonly<{
  title: string
  body: string
  url: string
  tag: string
}>

export type PushTarget = Readonly<{
  endpoint: string
  expirationTime: number | null
  keys: Readonly<{
    p256dh: string
    auth: string
  }>
}>

export class PushSubscriptionExpired extends Schema.TaggedError<PushSubscriptionExpired>()(
  "PushSubscriptionExpired",
  { statusCode: Schema.Number },
) {}

export class PushRateLimited extends Schema.TaggedError<PushRateLimited>()("PushRateLimited", {
  retryAfterSeconds: Schema.Number,
}) {}

export class PushDeliveryError extends Schema.TaggedError<PushDeliveryError>()(
  "PushDeliveryError",
  { code: Schema.String, retryable: Schema.Boolean },
) {}

export type PushTransportError = PushSubscriptionExpired | PushRateLimited | PushDeliveryError

export type PushTransportService = {
  readonly send: (
    target: PushTarget,
    payload: PushNotificationPayload,
  ) => Effect.Effect<void, PushTransportError>
}

export class PushTransport extends Context.Tag("@pistonpost/push/PushTransport")<
  PushTransport,
  PushTransportService
>() {}

function retryAfterSeconds(headers: webPush.Headers) {
  const raw = headers["retry-after"]
  if (!raw) return 60
  const seconds = Number.parseInt(raw, 10)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 15 * 60)
  const date = Date.parse(raw)
  if (Number.isNaN(date)) return 60
  return Math.min(15 * 60, Math.max(1, Math.ceil((date - Date.now()) / 1_000)))
}

export function classifyPushFailure(cause: unknown): PushTransportError {
  if (cause instanceof webPush.WebPushError) {
    if (cause.statusCode === 404 || cause.statusCode === 410) {
      return new PushSubscriptionExpired({ statusCode: cause.statusCode })
    }
    if (cause.statusCode === 429) {
      return new PushRateLimited({ retryAfterSeconds: retryAfterSeconds(cause.headers) })
    }
    return new PushDeliveryError({
      code: `provider-${cause.statusCode}`,
      retryable: cause.statusCode >= 500,
    })
  }
  return new PushDeliveryError({ code: "transport", retryable: true })
}

export function createWebPushTransport(config: {
  readonly subject: string
  readonly publicKey: string
  readonly getPrivateKey: () => Promise<string>
}): PushTransportService {
  return {
    send: (target, payload) => {
      if (!isTrustedPushEndpoint(target.endpoint)) {
        return Effect.fail(new PushDeliveryError({ code: "endpoint-rejected", retryable: false }))
      }
      return Effect.tryPromise({
        try: async () => {
          const privateKey = await config.getPrivateKey()
          await webPush.sendNotification(target, JSON.stringify(payload), {
            TTL: 24 * 60 * 60,
            urgency: "normal",
            topic: payload.tag.slice(0, 32),
            timeout: 10_000,
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey,
            },
          })
        },
        catch: classifyPushFailure,
      })
    },
  }
}

export function webPushTransportLayer(config: {
  readonly subject: string
  readonly publicKey: string
  readonly getPrivateKey: () => Promise<string>
}) {
  return Layer.succeed(PushTransport, createWebPushTransport(config))
}
