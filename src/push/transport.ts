import { Context, Effect, Layer, Schema } from "effect"
import * as webPush from "web-push"

import { isTrustedPushEndpoint } from "./subscription"

const pushPayloadSchema = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  url: Schema.String,
  tag: Schema.String,
})

export type PushNotificationPayload = typeof pushPayloadSchema.Type

export type PushTarget = Readonly<{
  endpoint: string
  expirationTime: number | null
  keys: Readonly<{
    p256dh: string
    auth: string
  }>
}>

export class PushSubscriptionExpired extends Schema.TaggedError<
  PushSubscriptionExpired,
  { readonly brand: unique symbol }
>()("PushSubscriptionExpired", { statusCode: Schema.Finite }) {}

export class PushRateLimited extends Schema.TaggedError<
  PushRateLimited,
  { readonly brand: unique symbol }
>()("PushRateLimited", {
  retryAfterSeconds: Schema.Finite,
}) {}

export class PushDeliveryError extends Schema.TaggedError<
  PushDeliveryError,
  { readonly brand: unique symbol }
>()("PushDeliveryError", { code: Schema.String, retryable: Schema.Boolean }) {}

export type PushTransportError = PushSubscriptionExpired | PushRateLimited | PushDeliveryError

export type PushTransportService = {
  readonly send: (
    target: PushTarget,
    payload: PushNotificationPayload,
  ) => Effect.Effect<void, PushTransportError>
}

export class PushTransport extends Context.Service<PushTransport, PushTransportService>()(
  "pistonpost/push/transport/PushTransport",
) {}

function retryAfterSeconds(headers: webPush.Headers) {
  const raw = headers["retry-after"]
  if (!raw) return 60
  const seconds = Number(raw)
  if (Number.isInteger(seconds) && seconds > 0) return Math.min(seconds, 15 * 60)
  const date = Date.parse(raw)
  if (Number.isNaN(date)) return 60
  return Math.min(15 * 60, Math.max(1, Math.ceil((date - Date.now()) / 1000)))
}

export function classifyPushFailure(cause: unknown): PushTransportError {
  if (cause instanceof webPush.WebPushError) {
    if (cause.statusCode === 404 || cause.statusCode === 410) {
      return PushSubscriptionExpired.make({ statusCode: cause.statusCode })
    }
    if (cause.statusCode === 429) {
      return PushRateLimited.make({ retryAfterSeconds: retryAfterSeconds(cause.headers) })
    }
    return PushDeliveryError.make({
      code: `provider-${cause.statusCode}`,
      retryable: cause.statusCode >= 500,
    })
  }
  return PushDeliveryError.make({ code: "transport", retryable: true })
}

export function createWebPushTransport(config: {
  readonly subject: string
  readonly publicKey: string
  readonly getPrivateKey: () => Promise<string>
}): PushTransportService {
  return {
    send: (target, payload) => {
      if (!isTrustedPushEndpoint(target.endpoint)) {
        return Effect.fail(PushDeliveryError.make({ code: "endpoint-rejected", retryable: false }))
      }
      return Schema.encodeEffect(Schema.fromJsonString(pushPayloadSchema))(payload).pipe(
        Effect.mapError(classifyPushFailure),
        Effect.flatMap((json) =>
          Effect.tryPromise({
            try: async () => {
              const privateKey = await config.getPrivateKey()
              await webPush.sendNotification(target, json, {
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
          }),
        ),
      )
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
