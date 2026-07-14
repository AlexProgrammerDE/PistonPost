import { Schema } from "effect"

import type { EmailContent } from "./email"

const CommentData = Schema.Struct({
  actorName: Schema.String,
  postTitle: Schema.String,
  postUrl: Schema.String,
})

const ModerationData = Schema.Struct({
  action: Schema.String,
  reason: Schema.String,
  targetUrl: Schema.String,
})

const MigrationData = Schema.Struct({ claimUrl: Schema.String })

export const EmailJob = Schema.Union(
  Schema.Struct({
    version: Schema.Literal(1),
    type: Schema.Literal("email.comment"),
    idempotencyKey: Schema.String,
    to: Schema.String,
    data: CommentData,
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    type: Schema.Literal("email.moderation"),
    idempotencyKey: Schema.String,
    to: Schema.String,
    data: ModerationData,
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    type: Schema.Literal("email.migration-welcome"),
    idempotencyKey: Schema.String,
    to: Schema.String,
    data: MigrationData,
  }),
)

export type EmailJob = typeof EmailJob.Type

export function decodeEmailJob(input: unknown) {
  return Schema.decodeUnknownEither(EmailJob)(input)
}

export function emailJobContent(job: EmailJob): EmailContent {
  switch (job.type) {
    case "email.comment":
      return {
        template: "comment-notification",
        subject: `${job.data.actorName} commented on ${job.data.postTitle}`,
        preview: `A new comment was posted on ${job.data.postTitle}.`,
        heading: "New comment on your post",
        message: `${job.data.actorName} left a comment on “${job.data.postTitle}”.`,
        action: { label: "Read the comment", url: job.data.postUrl },
        footnote: "You can change comment email preferences in your account settings.",
      }
    case "email.moderation":
      return {
        template: "moderation-action",
        subject: "A moderation action affected your PistonPost content",
        preview: job.data.action,
        heading: job.data.action,
        message: job.data.reason,
        action: { label: "Review the action", url: job.data.targetUrl },
      }
    case "email.migration-welcome":
      return {
        template: "migration-welcome",
        subject: "Your PistonPost archive is ready",
        preview: "Claim your migrated PistonPost account.",
        heading: "Your old posts made the trip",
        message:
          "Your recoverable PistonPost posts and profile are attached to your existing email address. Sign in with this address to claim them.",
        action: { label: "Claim your account", url: job.data.claimUrl },
      }
  }

  return assertNever(job)
}

function assertNever(value: never): never {
  throw new Error(`Unsupported email job: ${String(value)}`)
}
