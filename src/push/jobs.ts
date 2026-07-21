import { Schema } from "effect"

const PushJobBase = {
  version: Schema.Literal(1),
  idempotencyKey: Schema.String,
  recipientUserId: Schema.String,
  subscriptionId: Schema.String,
}

export class CommentPushJob extends Schema.Class<CommentPushJob>("CommentPushJob")({
  ...PushJobBase,
  type: Schema.Literal("push.comment"),
  commentId: Schema.String,
}) {}

export class ReplyPushJob extends Schema.Class<ReplyPushJob>("ReplyPushJob")({
  ...PushJobBase,
  type: Schema.Literal("push.reply"),
  commentId: Schema.String,
}) {}

export class ModerationPushJob extends Schema.Class<ModerationPushJob>("ModerationPushJob")({
  ...PushJobBase,
  type: Schema.Literal("push.moderation"),
  auditEventId: Schema.String,
}) {}

export class SecurityPushJob extends Schema.Class<SecurityPushJob>("SecurityPushJob")({
  ...PushJobBase,
  type: Schema.Literal("push.security"),
  auditEventId: Schema.String,
}) {}

export const PushDeliveryJob = Schema.Union(
  CommentPushJob,
  ReplyPushJob,
  ModerationPushJob,
  SecurityPushJob,
)

export type PushDeliveryJob = typeof PushDeliveryJob.Type

export function decodePushDeliveryJob(input: unknown) {
  return Schema.decodeUnknownEither(PushDeliveryJob)(input)
}

type PushJobIdentity = Readonly<{
  recipientUserId: string
  subscriptionId: string
}>

export function commentPushJob(identity: PushJobIdentity, commentId: string) {
  return CommentPushJob.make({
    version: 1,
    type: "push.comment",
    idempotencyKey: `push.comment:${identity.subscriptionId}:${commentId}`,
    ...identity,
    commentId,
  })
}

export function replyPushJob(identity: PushJobIdentity, commentId: string) {
  return ReplyPushJob.make({
    version: 1,
    type: "push.reply",
    idempotencyKey: `push.reply:${identity.subscriptionId}:${commentId}`,
    ...identity,
    commentId,
  })
}

export function moderationPushJob(identity: PushJobIdentity, auditEventId: string) {
  return ModerationPushJob.make({
    version: 1,
    type: "push.moderation",
    idempotencyKey: `push.moderation:${identity.subscriptionId}:${auditEventId}`,
    ...identity,
    auditEventId,
  })
}

export function securityPushJob(identity: PushJobIdentity, auditEventId: string) {
  return SecurityPushJob.make({
    version: 1,
    type: "push.security",
    idempotencyKey: `push.security:${identity.subscriptionId}:${auditEventId}`,
    ...identity,
    auditEventId,
  })
}
