import { Context, Effect, Layer, Schema } from "effect"

import type { EmailContent, RenderedEmail } from "./email"
import { renderEmail } from "./render-email"

export type EmailAddress = Readonly<{ email: string; name: string }>

export type OutboundEmail = RenderedEmail & {
  readonly to: string | EmailAddress
  readonly from: string | EmailAddress
  readonly replyTo?: string | EmailAddress
  readonly idempotencyKey: string
  readonly headers?: Readonly<Record<string, string>>
}

export class EmailDeliveryError extends Schema.TaggedError<
  EmailDeliveryError,
  { readonly brand: unique symbol }
>()("EmailDeliveryError", {
  message: Schema.String,
  code: Schema.String,
  retryable: Schema.Boolean,
}) {}

export class EmailRenderError extends Schema.TaggedError<
  EmailRenderError,
  { readonly brand: unique symbol }
>()("EmailRenderError", {
  message: Schema.String,
}) {}

export type EmailTransportService = {
  readonly send: (message: OutboundEmail) => Effect.Effect<void, EmailDeliveryError>
}

export type EmailRendererService = {
  readonly render: (content: EmailContent) => Effect.Effect<RenderedEmail, EmailRenderError>
}

export class EmailTransport extends Context.Service<EmailTransport, EmailTransportService>()(
  "pistonpost/email/transport/EmailTransport",
) {}

export class EmailRenderer extends Context.Service<EmailRenderer, EmailRendererService>()(
  "pistonpost/email/transport/EmailRenderer",
) {
  static readonly layer = Layer.succeed(EmailRenderer, {
    render: (content) =>
      Effect.tryPromise({
        try: () => renderEmail(content),
        catch: (cause) =>
          EmailRenderError.make({
            message: cause instanceof Error ? cause.message : "Email rendering failed.",
          }),
      }),
  })
}

export type CloudflareEmailBinding = {
  readonly send: (message: {
    readonly to: string | EmailAddress
    readonly from: string | EmailAddress
    readonly replyTo?: string | EmailAddress
    readonly subject: string
    readonly html: string
    readonly text: string
    readonly headers?: Readonly<Record<string, string>>
  }) => Promise<unknown>
}

/**
 * Cloudflare Email Service codes that the same message will hit again on every retry. The
 * payload, its headers, or the recipient is the problem, so retrying only delays the dead
 * letter. Sender, account, quota, rate, and delivery errors stay retryable because they can
 * clear without changing the message, and the dead-letter queue keeps them for replay.
 * https://developers.cloudflare.com/email-service/api/send-emails/workers-api/#error-codes
 */
const permanentProviderErrorCodes: ReadonlySet<string> = new Set([
  "E_VALIDATION_ERROR",
  "E_FIELD_MISSING",
  "E_TOO_MANY_RECIPIENTS",
  "E_TOO_MANY_ATTACHMENTS",
  "E_RECIPIENT_NOT_ALLOWED",
  "E_RECIPIENT_SUPPRESSED",
  "E_CONTENT_TOO_LARGE",
  "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD",
  "E_HEADER_VALUE_INVALID",
  "E_HEADER_VALUE_TOO_LONG",
  "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE",
  "E_HEADERS_TOO_MANY",
])

export function isRetryableProviderError(code: string) {
  return !permanentProviderErrorCodes.has(code)
}

function providerErrorCode(cause: unknown) {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return "E_UNKNOWN"
  const code = Reflect.get(cause, "code")
  return typeof code === "string" ? code : "E_UNKNOWN"
}

export function createCloudflareEmailTransport(
  binding: CloudflareEmailBinding,
): EmailTransportService {
  return {
    send: (message) =>
      Effect.tryPromise({
        try: async () => {
          await binding.send({
            to: message.to,
            from: message.from,
            replyTo: message.replyTo,
            subject: message.subject,
            html: message.html,
            text: message.text,
            headers: message.headers,
          })
        },
        catch: (cause) => {
          const code = providerErrorCode(cause)
          return EmailDeliveryError.make({
            message: cause instanceof Error ? cause.message : "Email delivery failed.",
            code,
            retryable: isRetryableProviderError(code),
          })
        },
      }),
  }
}

export function cloudflareEmailTransportLayer(binding: CloudflareEmailBinding) {
  return Layer.succeed(EmailTransport, createCloudflareEmailTransport(binding))
}

export type EmailDelivery = Omit<OutboundEmail, keyof RenderedEmail> & {
  readonly content: EmailContent
}

function subscriptionHeaders(content: EmailContent) {
  if (!content.subscription) return undefined
  return {
    "List-Unsubscribe": `<${content.subscription.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "List-ID": content.subscription.listId,
  }
}

export const deliverEmail = Effect.fn("Email.deliver")(function* (message: EmailDelivery) {
  const renderer = yield* EmailRenderer
  const transport = yield* EmailTransport
  const rendered = yield* renderer.render(message.content)
  yield* transport.send({
    ...rendered,
    to: message.to,
    from: message.from,
    replyTo: message.replyTo,
    idempotencyKey: message.idempotencyKey,
    headers: subscriptionHeaders(message.content),
  })
})

/**
 * Sends an authentication email once. A failed send may still have been accepted, so an
 * automatic retry could deliver duplicate links. The person can request another email.
 */
export const deliverImmediateEmail = Effect.fn("Email.deliverImmediate")(function* (
  message: EmailDelivery,
) {
  yield* deliverEmail(message)
})

export function createCaptureEmailTransport(captured: OutboundEmail[]): EmailTransportService {
  return {
    send: (message) =>
      Effect.sync(() => {
        captured.push(message)
      }),
  }
}
