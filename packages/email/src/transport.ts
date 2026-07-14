import { Context, Effect, Layer, Schema } from "effect"

import type { RenderedEmail } from "./email"

export type EmailAddress = Readonly<{ email: string; name: string }>

export type OutboundEmail = RenderedEmail & {
  readonly to: string | EmailAddress
  readonly from: string | EmailAddress
  readonly replyTo?: string | EmailAddress
  readonly idempotencyKey: string
}

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()(
  "EmailDeliveryError",
  {
    message: Schema.String,
  },
) {}

export type EmailTransportService = {
  readonly send: (message: OutboundEmail) => Effect.Effect<void, EmailDeliveryError>
}

export class EmailTransport extends Context.Tag("@pistonpost/email/EmailTransport")<
  EmailTransport,
  EmailTransportService
>() {}

export type CloudflareEmailBinding = {
  readonly send: (message: {
    readonly to: string | EmailAddress
    readonly from: string | EmailAddress
    readonly replyTo?: string | EmailAddress
    readonly subject: string
    readonly html: string
    readonly text: string
  }) => Promise<unknown>
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
          })
        },
        catch: (cause) =>
          new EmailDeliveryError({
            message: cause instanceof Error ? cause.message : "Email delivery failed.",
          }),
      }),
  }
}

export function cloudflareEmailLayer(binding: CloudflareEmailBinding) {
  return Layer.succeed(EmailTransport, createCloudflareEmailTransport(binding))
}

export function createCaptureEmailTransport(captured: Array<OutboundEmail>): EmailTransportService {
  return {
    send: (message) =>
      Effect.sync(() => {
        captured.push(message)
      }),
  }
}
