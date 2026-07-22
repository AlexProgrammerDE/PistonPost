import { Effect, Schema } from "effect"

import type { EmailNotificationPreference } from "@/domain"

const claimsSchema = Schema.Struct({
  version: Schema.Literal(1),
  userId: Schema.String,
  preference: Schema.Literal("comment-email", "reply-email", "product-email"),
  expiresAt: Schema.Number,
})

export class UnsubscribeTokenError extends Schema.TaggedError<UnsubscribeTokenError>()(
  "UnsubscribeTokenError",
  { message: Schema.String },
) {}

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

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
    catch: () => new UnsubscribeTokenError({ message: "The signing key is unavailable." }),
  })
}

export const signUnsubscribeToken = Effect.fn("Email.signUnsubscribeToken")(function* (
  userId: string,
  preference: EmailNotificationPreference,
  secret: string,
  expiresAt = Date.now() + 180 * 24 * 60 * 60 * 1_000,
) {
  const payload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify({ version: 1, userId, preference, expiresAt })),
  )
  const key = yield* signingKey(secret)
  const signature = yield* Effect.tryPromise({
    try: () => crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
    catch: () => new UnsubscribeTokenError({ message: "The token could not be signed." }),
  })
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
})

export const verifyUnsubscribeToken = Effect.fn("Email.verifyUnsubscribeToken")(function* (
  token: string,
  secret: string,
  now = Date.now(),
) {
  const parts = token.split(".")
  if (parts.length !== 2) {
    return yield* Effect.fail(new UnsubscribeTokenError({ message: "The link is invalid." }))
  }
  const [payload, signature] = parts
  if (!payload || !signature) {
    return yield* Effect.fail(new UnsubscribeTokenError({ message: "The link is invalid." }))
  }
  const key = yield* signingKey(secret)
  const valid = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.verify(
        "HMAC",
        key,
        decodeBase64Url(signature),
        new TextEncoder().encode(payload),
      ),
    catch: () => new UnsubscribeTokenError({ message: "The link is invalid." }),
  })
  if (!valid) {
    return yield* Effect.fail(new UnsubscribeTokenError({ message: "The link is invalid." }))
  }
  const claims = yield* Effect.try({
    try: () => JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))),
    catch: () => new UnsubscribeTokenError({ message: "The link is invalid." }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknown(claimsSchema)),
    Effect.catchTag("ParseError", () =>
      Effect.fail(new UnsubscribeTokenError({ message: "The link is invalid." })),
    ),
  )
  if (claims.expiresAt <= now) {
    return yield* Effect.fail(new UnsubscribeTokenError({ message: "The link has expired." }))
  }
  return claims
})
