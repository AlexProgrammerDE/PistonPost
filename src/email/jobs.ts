import { Schema } from "effect"

export class CommentEmailJob extends Schema.Class<CommentEmailJob>("CommentEmailJob")({
  version: Schema.Literal(2),
  type: Schema.Literal("email.comment"),
  idempotencyKey: Schema.String,
  recipientUserId: Schema.String,
  commentId: Schema.String,
}) {}

export class ReplyEmailJob extends Schema.Class<ReplyEmailJob>("ReplyEmailJob")({
  version: Schema.Literal(2),
  type: Schema.Literal("email.reply"),
  idempotencyKey: Schema.String,
  recipientUserId: Schema.String,
  commentId: Schema.String,
}) {}

export class ModerationEmailJob extends Schema.Class<ModerationEmailJob>("ModerationEmailJob")({
  version: Schema.Literal(2),
  type: Schema.Literal("email.moderation"),
  idempotencyKey: Schema.String,
  recipientUserId: Schema.String,
  auditEventId: Schema.String,
}) {}

export class SecurityEmailJob extends Schema.Class<SecurityEmailJob>("SecurityEmailJob")({
  version: Schema.Literal(2),
  type: Schema.Literal("email.security"),
  idempotencyKey: Schema.String,
  recipientUserId: Schema.String,
  auditEventId: Schema.String,
}) {}

export class ProductEmailJob extends Schema.Class<ProductEmailJob>("ProductEmailJob")({
  version: Schema.Literal(2),
  type: Schema.Literal("email.product"),
  idempotencyKey: Schema.String,
  recipientUserId: Schema.String,
  campaignId: Schema.String,
}) {}

export class ProductEmailBatchJob extends Schema.Class<ProductEmailBatchJob>(
  "ProductEmailBatchJob",
)({
  version: Schema.Literal(2),
  type: Schema.Literal("email.product-batch"),
  idempotencyKey: Schema.String,
  campaignId: Schema.String,
  cursorUserId: Schema.NullOr(Schema.String),
}) {}

export const EmailDeliveryJob = Schema.Union(
  CommentEmailJob,
  ReplyEmailJob,
  ModerationEmailJob,
  SecurityEmailJob,
  ProductEmailJob,
)

export type EmailDeliveryJob = typeof EmailDeliveryJob.Type

export const EmailQueueJob = Schema.Union(EmailDeliveryJob, ProductEmailBatchJob)

export type EmailQueueJob = typeof EmailQueueJob.Type

export function decodeEmailDeliveryJob(input: unknown) {
  return Schema.decodeUnknownEither(EmailDeliveryJob)(input)
}

export function decodeEmailQueueJob(input: unknown) {
  return Schema.decodeUnknownEither(EmailQueueJob)(input)
}

export function commentEmailJob(recipientUserId: string, commentId: string) {
  return CommentEmailJob.make({
    version: 2,
    type: "email.comment",
    idempotencyKey: `email.comment:${recipientUserId}:${commentId}`,
    recipientUserId,
    commentId,
  })
}

export function replyEmailJob(recipientUserId: string, commentId: string) {
  return ReplyEmailJob.make({
    version: 2,
    type: "email.reply",
    idempotencyKey: `email.reply:${recipientUserId}:${commentId}`,
    recipientUserId,
    commentId,
  })
}

export function moderationEmailJob(recipientUserId: string, auditEventId: string) {
  return ModerationEmailJob.make({
    version: 2,
    type: "email.moderation",
    idempotencyKey: `email.moderation:${recipientUserId}:${auditEventId}`,
    recipientUserId,
    auditEventId,
  })
}

export function securityEmailJob(recipientUserId: string, auditEventId: string) {
  return SecurityEmailJob.make({
    version: 2,
    type: "email.security",
    idempotencyKey: `email.security:${recipientUserId}:${auditEventId}`,
    recipientUserId,
    auditEventId,
  })
}

export function productEmailJob(recipientUserId: string, campaignId: string) {
  return ProductEmailJob.make({
    version: 2,
    type: "email.product",
    idempotencyKey: `email.product:${campaignId}:${recipientUserId}`,
    recipientUserId,
    campaignId,
  })
}

export function productEmailBatchJob(campaignId: string, cursorUserId: string | null) {
  return ProductEmailBatchJob.make({
    version: 2,
    type: "email.product-batch",
    idempotencyKey: `email.product-batch:${campaignId}:${cursorUserId ?? "start"}`,
    campaignId,
    cursorUserId,
  })
}
