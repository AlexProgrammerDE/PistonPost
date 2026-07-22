import { Context, Effect, Layer, Schema } from "effect"

import { renderEmail, type EmailContent, type RenderedEmail } from "./email"

export type EmailAddress = Readonly<{ email: string; name: string }>

export type OutboundEmail = RenderedEmail & {
  readonly to: string | EmailAddress
  readonly from: string | EmailAddress
  readonly replyTo?: string | EmailAddress
  readonly idempotencyKey: string
  readonly headers?: Readonly<Record<string, string>>
}

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()(
  "EmailDeliveryError",
  {
    message: Schema.String,
    code: Schema.String,
    retryable: Schema.Boolean,
  },
) {}

export class EmailRenderError extends Schema.TaggedError<EmailRenderError>()("EmailRenderError", {
  message: Schema.String,
}) {}

export type EmailTransportService = {
  readonly send: (message: OutboundEmail) => Effect.Effect<void, EmailDeliveryError>
}

export type EmailRendererService = {
  readonly render: (content: EmailContent) => Effect.Effect<RenderedEmail, EmailRenderError>
}

export class EmailTransport extends Context.Tag("@pistonpost/email/EmailTransport")<
  EmailTransport,
  EmailTransportService
>() {}

export class EmailRenderer extends Context.Tag("@pistonpost/email/EmailRenderer")<
  EmailRenderer,
  EmailRendererService
>() {
  static readonly live = Layer.succeed(EmailRenderer, {
    render: (content) =>
      Effect.tryPromise({
        try: () => renderEmail(content),
        catch: (cause) =>
          new EmailRenderError({
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
          return new EmailDeliveryError({
            message: cause instanceof Error ? cause.message : "Email delivery failed.",
            code,
            retryable: code !== "E_RECIPIENT_SUPPRESSED",
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

export const deliverImmediateEmail = Effect.fn("Email.deliverImmediate")(function* (
  message: EmailDelivery,
) {
  yield* deliverEmail(message).pipe(
    Effect.retry({
      times: 2,
      until: (error) => error instanceof EmailRenderError || !error.retryable,
    }),
  )
})

export function createCaptureEmailTransport(captured: Array<OutboundEmail>): EmailTransportService {
  return {
    send: (message) =>
      Effect.sync(() => {
        captured.push(message)
      }),
  }
}
