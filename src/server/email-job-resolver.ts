import { and, eq } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Context, DateTime, Effect, Layer, Schema } from "effect"

import { notBannedAccount } from "@/db/account-ban"
import * as schema from "@/db/schema"
import type { EmailNotificationPreference } from "@/domain/validation"
import type { EmailContent } from "@/email/email"
import type { EmailDeliveryJob } from "@/email/jobs"
import {
  emailSubscription,
  productUpdateMessage,
  securityNotificationMessage,
} from "@/email/messages"
import { signUnsubscribeToken } from "@/email/unsubscribe"

import { EMAIL_CHANGE_AUDIT_ACTION, previousEmailFrom } from "./email-change-audit"
import { notificationEnabled, optInNotificationEnabled } from "./notification-policy"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

export type ResolvedEmail =
  | Readonly<{
      _tag: "Ready"
      to: string
      channel: "authentication" | "notification" | "marketing"
      content: EmailContent
      campaignId?: string
    }>
  | Readonly<{ _tag: "Skip"; reason: string; campaignId?: string }>

export class EmailResolutionError extends Schema.TaggedError<
  EmailResolutionError,
  { readonly brand: unique symbol }
>()("EmailResolutionError", { message: Schema.String }) {}

export class EmailJobResolver extends Context.Service<
  EmailJobResolver,
  {
    readonly resolve: (job: EmailDeliveryJob) => Effect.Effect<ResolvedEmail, EmailResolutionError>
  }
>()("pistonpost/server/email-job-resolver/EmailJobResolver") {}

function skip(reason: string, campaignId?: string): ResolvedEmail {
  return campaignId ? { _tag: "Skip", reason, campaignId } : { _tag: "Skip", reason }
}

function ready(value: Omit<Extract<ResolvedEmail, { _tag: "Ready" }>, "_tag">): ResolvedEmail {
  return { _tag: "Ready", ...value }
}

function queryFailure() {
  return EmailResolutionError.make({ message: "Email delivery data could not be loaded." })
}

function promiseQuery<T>(query: () => T | PromiseLike<T>) {
  return Effect.tryPromise({ try: async () => query(), catch: queryFailure }).pipe(
    Effect.uninterruptible,
  )
}

function commentContent(
  actorName: string,
  postTitle: string,
  postUrl: string,
  unsubscribeUrl: string,
): EmailContent {
  return {
    template: "comment-notification",
    subject: `${actorName} commented on ${postTitle}`,
    preview: `A new comment was posted on ${postTitle}.`,
    heading: "New comment on your post",
    message: `${actorName} left a comment on “${postTitle}”.`,
    action: { label: "Read the comment", url: postUrl },
    footnote: "You can change comment email preferences in your account settings.",
    subscription: emailSubscription("comment-email", unsubscribeUrl),
  }
}

function replyContent(
  actorName: string,
  postTitle: string,
  postUrl: string,
  unsubscribeUrl: string,
): EmailContent {
  return {
    template: "reply-notification",
    subject: `${actorName} replied to your comment`,
    preview: `A new reply was posted on ${postTitle}.`,
    heading: "New reply to your comment",
    message: `${actorName} replied to your comment on “${postTitle}”.`,
    action: { label: "Read the reply", url: postUrl },
    footnote: "You can change reply email preferences in your account settings.",
    subscription: emailSubscription("reply-email", unsubscribeUrl),
  }
}

function createUnsubscribeUrl(baseURL: URL, token: string) {
  return new URL(`/email/unsubscribe?token=${encodeURIComponent(token)}`, baseURL).toString()
}

export function emailJobResolverLayer(
  database: Database,
  config: Readonly<{
    baseURL: string
    getUnsubscribeSecret: () => Promise<string>
  }>,
) {
  return Layer.succeed(EmailJobResolver, {
    resolve: Effect.fn("EmailJobResolver.resolve")(function* (job: EmailDeliveryJob) {
      const baseURL = new URL(config.baseURL)
      if (job.type === "email.comment" || job.type === "email.reply") {
        const now = yield* DateTime.nowAsDate
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
            .where(
              and(
                eq(schema.comments.id, job.commentId),
                // A banned account's comments are hidden, so a queued or retried email must not
                // point at one.
                notBannedAccount(schema.comments.authorId, now),
              ),
            )
            .get(),
        )
        if (comment?.status !== "published" || comment.postStatus !== "published") {
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
        const emailPreference: EmailNotificationPreference =
          preference === "reply" ? "reply-email" : "comment-email"
        const unsubscribeSecret = yield* Effect.tryPromise({
          try: config.getUnsubscribeSecret,
          catch: queryFailure,
        })
        const token = yield* signUnsubscribeToken(
          job.recipientUserId,
          emailPreference,
          unsubscribeSecret,
        ).pipe(Effect.catchTag("UnsubscribeTokenError", () => Effect.fail(queryFailure())))
        const preferenceUrl = createUnsubscribeUrl(baseURL, token)
        return ready({
          to: recipient.email,
          channel: "notification",
          content:
            preference === "reply"
              ? replyContent(comment.actorName, comment.postTitle, postUrl, preferenceUrl)
              : commentContent(comment.actorName, comment.postTitle, postUrl, preferenceUrl),
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
          typeof event.metadata["reason"] === "string"
            ? event.metadata["reason"]
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
            .select({
              action: schema.auditEvents.action,
              actorId: schema.auditEvents.actorId,
              metadata: schema.auditEvents.metadata,
              createdAt: schema.auditEvents.createdAt,
            })
            .from(schema.auditEvents)
            .where(eq(schema.auditEvents.id, job.auditEventId))
            .get(),
        )
        if (!event || event.actorId !== job.recipientUserId) {
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
        const secureAccountUrl = new URL("/settings/security", baseURL).toString()
        if (event.action === EMAIL_CHANGE_AUDIT_ACTION) {
          if (job.audience !== "previous-email") {
            return ready({
              to: recipient.email,
              channel: "authentication",
              content: securityNotificationMessage({
                template: "email-changed",
                audience: "new-email",
                secureAccountUrl,
              }),
            })
          }
          // The audit event keeps the replaced address only for a limited time.
          const previousEmail = previousEmailFrom(event.metadata)
          if (!previousEmail) return skip("previous-email-unavailable")
          // The account switched back to this address before the job ran.
          if (previousEmail.toLowerCase() === recipient.email.toLowerCase()) {
            return skip("previous-email-in-use")
          }
          return ready({
            to: previousEmail,
            channel: "authentication",
            content: securityNotificationMessage({
              template: "email-changed",
              audience: "previous-email",
              secureAccountUrl,
            }),
          })
        }
        if (job.audience) return skip("event-unsupported")
        const template =
          event.action === "auth.new-device"
            ? "new-device"
            : event.action === "auth.password-changed" || event.action === "auth.password-reset"
              ? "password-changed"
              : null
        if (!template) return skip("event-unsupported")
        return ready({
          to: recipient.email,
          channel: "authentication",
          content: securityNotificationMessage({
            template,
            email: recipient.email,
            secureAccountUrl,
            timestamp: event.createdAt.toISOString(),
          }),
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
      if (!recipient || !optInNotificationEnabled(recipient.enabled)) {
        return skip("preference-disabled", campaign.id)
      }
      const unsubscribeSecret = yield* Effect.tryPromise({
        try: config.getUnsubscribeSecret,
        catch: queryFailure,
      })
      const token = yield* signUnsubscribeToken(
        job.recipientUserId,
        "product-email",
        unsubscribeSecret,
      ).pipe(Effect.catchTag("UnsubscribeTokenError", () => Effect.fail(queryFailure())))
      return ready({
        to: recipient.email,
        channel: "marketing",
        campaignId: campaign.id,
        content: productUpdateMessage({
          subject: campaign.subject,
          preview: campaign.preview,
          heading: campaign.heading,
          message: campaign.message,
          actionLabel: campaign.actionLabel,
          actionUrl: campaign.actionUrl,
          unsubscribeUrl: createUnsubscribeUrl(baseURL, token),
        }),
      })
    }),
  })
}
