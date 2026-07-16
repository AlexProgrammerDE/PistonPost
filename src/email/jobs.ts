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
  }

  return assertNever(job)
}

function assertNever(value: never): never {
  throw new Error(`Unsupported email job: ${String(value)}`)
}
