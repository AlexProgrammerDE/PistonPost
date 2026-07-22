import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

import type { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import {
  securityNotificationMessage,
  signUnsubscribeToken,
  productUpdateMessage,
  type EmailContent,
  type EmailDeliveryJob,
} from "@/email"

import { notificationEnabled } from "./notification-policy"

type Database = ReturnType<typeof createD1Database>

export type ResolvedEmail =
  | Readonly<{
      _tag: "Ready"
      to: string
      channel: "authentication" | "notification"
      content: EmailContent
      campaignId?: string
    }>
  | Readonly<{ _tag: "Skip"; reason: string; campaignId?: string }>

export class EmailResolutionError extends Schema.TaggedError<EmailResolutionError>()(
  "EmailResolutionError",
  { message: Schema.String },
) {}

export class EmailJobResolver extends Context.Tag("@pistonpost/email/EmailJobResolver")<
  EmailJobResolver,
  {
    readonly resolve: (job: EmailDeliveryJob) => Effect.Effect<ResolvedEmail, EmailResolutionError>
  }
>() {}

function skip(reason: string, campaignId?: string): ResolvedEmail {
  return campaignId ? { _tag: "Skip", reason, campaignId } : { _tag: "Skip", reason }
}

function ready(value: Omit<Extract<ResolvedEmail, { _tag: "Ready" }>, "_tag">): ResolvedEmail {
  return { _tag: "Ready", ...value }
}

function queryFailure() {
  return new EmailResolutionError({ message: "Email delivery data could not be loaded." })
}

function promiseQuery<T>(query: () => Promise<T>) {
  return Effect.tryPromise({ try: query, catch: queryFailure })
}

function commentContent(actorName: string, postTitle: string, postUrl: string): EmailContent {
  return {
    template: "comment-notification",
    subject: `${actorName} commented on ${postTitle}`,
    preview: `A new comment was posted on ${postTitle}.`,
    heading: "New comment on your post",
    message: `${actorName} left a comment on “${postTitle}”.`,
    action: { label: "Read the comment", url: postUrl },
    footnote: "You can change comment email preferences in your account settings.",
  }
}

function replyContent(actorName: string, postTitle: string, postUrl: string): EmailContent {
  return {
    template: "reply-notification",
    subject: `${actorName} replied to your comment`,
    preview: `A new reply was posted on ${postTitle}.`,
    heading: "New reply to your comment",
    message: `${actorName} replied to your comment on “${postTitle}”.`,
    action: { label: "Read the reply", url: postUrl },
    footnote: "You can change reply email preferences in your account settings.",
  }
}

export function emailJobResolverLayer(
  database: Database,
  config: Readonly<{ baseURL: string; getUnsubscribeSecret: () => Promise<string> }>,
) {
  return Layer.succeed(EmailJobResolver, {
    resolve: Effect.fn("EmailJobResolver.resolve")(function* (job) {
      const baseURL = new URL(config.baseURL)
      if (job.type === "email.comment" || job.type === "email.reply") {
        const comment = yield* promiseQuery(() =>
          database
            .select({
              id: schema.comments.id,
              status: schema.comments.status,
              parentId: schema.comments.parentId,
              authorId: schema.comments.authorId,
              actorName: schema.user.name,
              postId: schema.posts.id,
              postStatus: schema.posts.status,
              postAuthorId: schema.posts.authorId,
              postTitle: schema.posts.title,
            })
            .from(schema.comments)
            .innerJoin(schema.posts, eq(schema.posts.id, schema.comments.postId))
            .innerJoin(schema.user, eq(schema.user.id, schema.comments.authorId))
            .where(eq(schema.comments.id, job.commentId))
            .get(),
        )
        if (!comment || comment.status !== "published" || comment.postStatus !== "published") {
          return skip("content-unavailable")
        }

        let expectedRecipientId = comment.postAuthorId
        let preference: "comment" | "reply" = "comment"
        if (job.type === "email.reply") {
          if (!comment.parentId) return skip("not-a-reply")
          const parentId = comment.parentId
          const parent = yield* promiseQuery(() =>
            database
              .select({ authorId: schema.comments.authorId, parentId: schema.comments.parentId })
              .from(schema.comments)
              .where(and(eq(schema.comments.id, parentId), eq(schema.comments.status, "published")))
              .get(),
          )
          if (!parent || parent.parentId) {
            return skip("parent-unavailable")
          }
          expectedRecipientId = parent.authorId
          preference = "reply"
        }
        if (
          expectedRecipientId !== job.recipientUserId ||
          comment.authorId === job.recipientUserId
        ) {
          return skip("recipient-mismatch")
        }
        const recipient = yield* promiseQuery(() =>
          database
            .select({
              email: schema.user.email,
              commentNotifications: schema.userSettings.commentNotifications,
              replyNotifications: schema.userSettings.replyNotifications,
            })
            .from(schema.user)
            .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
            .where(eq(schema.user.id, job.recipientUserId))
            .get(),
        )
        const enabled =
          preference === "reply" ? recipient?.replyNotifications : recipient?.commentNotifications
        if (!recipient || !notificationEnabled(enabled ?? null)) {
          return skip("preference-disabled")
        }
        const postUrl = new URL(`/post/${comment.postId}#comment-${comment.id}`, baseURL).toString()
        return ready({
          to: recipient.email,
          channel: "notification",
          content:
            preference === "reply"
              ? replyContent(comment.actorName, comment.postTitle, postUrl)
              : commentContent(comment.actorName, comment.postTitle, postUrl),
        })
      }

      if (job.type === "email.moderation") {
        const event = yield* promiseQuery(() =>
          database
            .select()
            .from(schema.auditEvents)
            .where(eq(schema.auditEvents.id, job.auditEventId))
            .get(),
        )
        if (!event || event.actorId === job.recipientUserId) {
          return skip("event-unavailable")
        }
        const recipient = yield* promiseQuery(() =>
          database
            .select({ email: schema.user.email })
            .from(schema.user)
            .where(eq(schema.user.id, job.recipientUserId))
            .get(),
        )
        if (!recipient) return skip("recipient-unavailable")
        const owner =
          event.entityType === "post"
            ? yield* promiseQuery(() =>
                database
                  .select({ userId: schema.posts.authorId, postId: schema.posts.id })
                  .from(schema.posts)
                  .where(eq(schema.posts.id, event.entityId))
                  .get(),
              )
            : yield* promiseQuery(() =>
                database
                  .select({ userId: schema.comments.authorId, postId: schema.comments.postId })
                  .from(schema.comments)
                  .where(eq(schema.comments.id, event.entityId))
                  .get(),
              )
        if (!owner || owner.userId !== job.recipientUserId) {
          return skip("recipient-mismatch")
        }
        const action = event.action.endsWith(".hide")
          ? "Your content was hidden"
          : event.action.endsWith(".restore")
            ? "Your content was restored"
            : null
        if (!action) return skip("event-unsupported")
        const reason =
          typeof event.metadata.reason === "string"
            ? event.metadata.reason
            : "An administrator updated this content."
        return ready({
          to: recipient.email,
          channel: "notification",
          content: {
            template: "moderation-action",
            subject: "A moderation action affected your PistonPost content",
            preview: action,
            heading: action,
            message: reason,
            action: {
              label: "Review the action",
              url: new URL(
                event.entityType === "post"
                  ? `/post/${owner.postId}`
                  : `/post/${owner.postId}#comment-${event.entityId}`,
                baseURL,
              ).toString(),
            },
          },
        })
      }

      if (job.type === "email.security") {
        const event = yield* promiseQuery(() =>
          database
            .select({ action: schema.auditEvents.action, actorId: schema.auditEvents.actorId })
            .from(schema.auditEvents)
            .where(eq(schema.auditEvents.id, job.auditEventId))
            .get(),
        )
        if (!event || event.actorId !== job.recipientUserId) {
          return skip("event-unavailable")
        }
        const template =
          event.action === "auth.new-device"
            ? "new-device"
            : event.action === "auth.email-change-requested"
              ? "email-changed"
              : event.action === "auth.password-changed" || event.action === "auth.password-reset"
                ? "password-changed"
                : null
        if (!template) return skip("event-unsupported")
        const recipient = yield* promiseQuery(() =>
          database
            .select({ email: schema.user.email })
            .from(schema.user)
            .where(eq(schema.user.id, job.recipientUserId))
            .get(),
        )
        if (!recipient) return skip("recipient-unavailable")
        return ready({
          to: recipient.email,
          channel: "authentication",
          content: {
            ...securityNotificationMessage({ template }),
            action: {
              label: "Review account security",
              url: new URL("/settings/security", baseURL).toString(),
            },
          },
        })
      }

      const campaign = yield* promiseQuery(() =>
        database
          .select()
          .from(schema.emailCampaigns)
          .where(eq(schema.emailCampaigns.id, job.campaignId))
          .get(),
      )
      if (!campaign || campaign.status === "draft") {
        return skip("campaign-unavailable", job.campaignId)
      }
      const recipient = yield* promiseQuery(() =>
        database
          .select({ email: schema.user.email, enabled: schema.userSettings.productNotifications })
          .from(schema.user)
          .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
          .where(eq(schema.user.id, job.recipientUserId))
          .get(),
      )
      if (!recipient || !notificationEnabled(recipient.enabled)) {
        return skip("preference-disabled", campaign.id)
      }
      const unsubscribeSecret = yield* Effect.tryPromise({
        try: config.getUnsubscribeSecret,
        catch: queryFailure,
      })
      const token = yield* signUnsubscribeToken(job.recipientUserId, unsubscribeSecret).pipe(
        Effect.catchTag("UnsubscribeTokenError", () => Effect.fail(queryFailure())),
      )
      return ready({
        to: recipient.email,
        channel: "notification",
        campaignId: campaign.id,
        content: productUpdateMessage({
          subject: campaign.subject,
          preview: campaign.preview,
          heading: campaign.heading,
          message: campaign.message,
          actionLabel: campaign.actionLabel,
          actionUrl: campaign.actionUrl,
          unsubscribeUrl: new URL(
            `/email/unsubscribe?token=${encodeURIComponent(token)}`,
            baseURL,
          ).toString(),
        }),
      })
    }),
  })
}
