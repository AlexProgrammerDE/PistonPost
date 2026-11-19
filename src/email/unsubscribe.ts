import { Clock, Effect, Result, Schema } from "effect"
import { Base64Url } from "effect/encoding"

import type { EmailNotificationPreference } from "@/domain/validation"

const claimsSchema = Schema.Struct({
  version: Schema.Literal(1),
  userId: Schema.String,
  preference: Schema.Literals(["comment-email", "reply-email", "product-email"]),
  expiresAt: Schema.Finite,
})

// JSON.stringify represents non-finite expiry values as null. Keep that wire format.
const signingClaimsSchema = Schema.fromJsonString(
  Schema.Struct({ ...claimsSchema.fields, expiresAt: Schema.NullOr(Schema.Finite) }),
)

export class UnsubscribeTokenError extends Schema.TaggedError<
  UnsubscribeTokenError,
  { readonly brand: unique symbol }
>()("UnsubscribeTokenError", { message: Schema.String }) {}

function signingKey(secret: string) {
  return Effect.tryPromise({
    try: () =>
      crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      ),
    catch: () => UnsubscribeTokenError.make({ message: "The signing key is unavailable." }),
  })
}

export const signUnsubscribeToken = Effect.fn("Email.signUnsubscribeToken")(function* (
  userId: string,
  preference: EmailNotificationPreference,
  secret: string,
  expiresAt?: number,
) {
  const expiry = expiresAt ?? (yield* Clock.currentTimeMillis) + 180 * 24 * 60 * 60 * 1000
  const json = yield* Schema.encodeEffect(signingClaimsSchema)({
    version: 1,
    userId,
    preference,
    expiresAt: Number.isFinite(expiry) ? expiry : null,
  }).pipe(
    Effect.mapError(() =>
      UnsubscribeTokenError.make({ message: "The token could not be signed." }),
    ),
  )
  const payload = Base64Url.encode(json)
  const key = yield* signingKey(secret)
  const signature = yield* Effect.tryPromise({
    try: () => crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
    catch: () => UnsubscribeTokenError.make({ message: "The token could not be signed." }),
  })
  return `${payload}.${Base64Url.encode(new Uint8Array(signature))}`
})

export const verifyUnsubscribeToken = Effect.fn("Email.verifyUnsubscribeToken")(function* (
  token: string,
  secret: string,
  now?: number,
) {
  const currentTime = now ?? (yield* Clock.currentTimeMillis)
  const parts = token.split(".")
  if (parts.length !== 2) {
    return yield* UnsubscribeTokenError.make({ message: "The link is invalid." })
  }
  const [payload, signature] = parts
  if (!payload || !signature) {
    return yield* UnsubscribeTokenError.make({ message: "The link is invalid." })
  }
  const key = yield* signingKey(secret)
  const valid = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.verify(
        "HMAC",
        key,
        Uint8Array.from(Result.getOrThrow(Base64Url.decode(signature))),
        new TextEncoder().encode(payload),
      ),
    catch: () => UnsubscribeTokenError.make({ message: "The link is invalid." }),
  })
  if (!valid) {
    return yield* UnsubscribeTokenError.make({ message: "The link is invalid." })
  }
  const claims = yield* Effect.try({
    try: () => Result.getOrThrow(Base64Url.decodeString(payload)),
    catch: () => UnsubscribeTokenError.make({ message: "The link is invalid." }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(claimsSchema))),
    Effect.catchTag("SchemaError", () =>
      Effect.fail(UnsubscribeTokenError.make({ message: "The link is invalid." })),
    ),
  )
  if (claims.expiresAt <= currentTime) {
    return yield* UnsubscribeTokenError.make({ message: "The link has expired." })
  }
  return claims
})
