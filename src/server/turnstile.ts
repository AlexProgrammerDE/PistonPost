import { Effect, Schema } from "effect"
import { z } from "zod"

import type { TurnstileAction } from "@/lib/turnstile"
import { HUMAN_VERIFICATION_ERROR_MESSAGE } from "@/lib/turnstile"
import type { AppRequestContext } from "@/server"

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA"

export const turnstileTokenSchema = z.string().min(1).max(2048)

const turnstileResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  hostname: Schema.optional(Schema.String),
  action: Schema.optional(Schema.String),
})

type TurnstileVerificationReason = "configuration" | "provider" | "rejected"

export class TurnstileVerificationError extends Schema.TaggedError<TurnstileVerificationError>()(
  "TurnstileVerificationError",
  {
    reason: Schema.Literal("configuration", "provider", "rejected"),
    message: Schema.String,
  },
) {}

type TurnstileVerificationInput = {
  readonly token: string
  readonly action: TurnstileAction
  readonly publicAppUrl: string
  readonly secret: string | SecretsStoreSecret
  readonly idempotencyKey?: string
  readonly fetch?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
}

function verificationError(reason: TurnstileVerificationReason) {
  return new TurnstileVerificationError({
    reason,
    message: HUMAN_VERIFICATION_ERROR_MESSAGE,
  })
}

export function allowedTurnstileHostnames(publicAppUrl: string) {
  const hostname = new URL(publicAppUrl).hostname
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? new Set([hostname, "example.com"])
    : new Set([hostname])
}

export const verifyTurnstile = Effect.fn("verifyTurnstile")(function* (
  input: TurnstileVerificationInput,
) {
  const secret = yield* Effect.tryPromise({
    try: async () =>
      (typeof input.secret === "string" ? input.secret : await input.secret.get()).trim(),
    catch: () => verificationError("configuration"),
  })
  if (!secret) return yield* verificationError("configuration")

  const expectedHostnames = yield* Effect.try({
    try: () => allowedTurnstileHostnames(input.publicAppUrl),
    catch: () => verificationError("configuration"),
  })
  const requestFetch = input.fetch ?? globalThis.fetch
  const response = yield* Effect.tryPromise({
    try: () =>
      requestFetch(TURNSTILE_SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          response: input.token,
          idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
        }),
      }),
    catch: () => verificationError("provider"),
  })
  if (!response.ok) return yield* verificationError("provider")

  const body = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: () => verificationError("provider"),
  })
  const result = yield* Schema.decodeUnknown(turnstileResponseSchema)(body).pipe(
    Effect.mapError(() => verificationError("provider")),
  )
  const actionMatches =
    result.action === input.action ||
    (secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET && result.action === undefined)

  if (
    !result.success ||
    !actionMatches ||
    !result.hostname ||
    !expectedHostnames.has(result.hostname)
  ) {
    return yield* verificationError("rejected")
  }

  return { action: input.action, hostname: result.hostname }
})

export function verifyRequestTurnstile(
  context: AppRequestContext,
  token: string,
  action: TurnstileAction,
) {
  return verifyTurnstile({
    token,
    action,
    publicAppUrl: context.runtime.config.PUBLIC_APP_URL.toString(),
    secret: context.env.TURNSTILE_SECRET,
  })
}
