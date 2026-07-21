import { and, eq, gt, isNull, or } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

import type { D1DatabaseClient } from "@/db"
import * as schema from "@/db/schema"
import type { PushDeliveryJob } from "@/push/jobs"
import type { PushNotificationPayload, PushTarget } from "@/push/transport"

export type ResolvedPush =
  | Readonly<{
      _tag: "Ready"
      payload: PushNotificationPayload
      target: PushTarget
    }>
  | Readonly<{
      _tag: "Skip"
      reason: string
    }>

export class PushResolutionError extends Schema.TaggedError<PushResolutionError>()(
  "PushResolutionError",
  { operation: Schema.String },
) {}

export class PushJobResolver extends Context.Tag("@pistonpost/push/PushJobResolver")<
  PushJobResolver,
  {
    readonly resolve: (job: PushDeliveryJob) => Effect.Effect<ResolvedPush, PushResolutionError>
  }
>() {}

function queryFailure() {
  return new PushResolutionError({ operation: "query" })
}

function query<T>(run: () => Promise<T>) {
  return Effect.tryPromise({ try: run, catch: queryFailure })
}

function skip(reason: string): ResolvedPush {
  return { _tag: "Skip", reason }
}

function ready(target: PushTarget, payload: PushNotificationPayload): ResolvedPush {
  return { _tag: "Ready", target, payload }
}

function notificationEnabled(value: boolean | null) {
  return value !== false
}

export function pushJobResolverLayer(database: D1DatabaseClient) {
  return Layer.succeed(PushJobResolver, {
    resolve: Effect.fn("PushJobResolver.resolve")(function* (job) {
      const now = new Date()
      const subscription = yield* query(() =>
        database
          .select({
            endpoint: schema.pushSubscriptions.endpoint,
            expirationTime: schema.pushSubscriptions.expirationTime,
            p256dh: schema.pushSubscriptions.p256dh,
            auth: schema.pushSubscriptions.auth,
          })
          .from(schema.pushSubscriptions)
          .innerJoin(schema.session, eq(schema.session.id, schema.pushSubscriptions.sessionId))
          .where(
            and(
              eq(schema.pushSubscriptions.id, job.subscriptionId),
              eq(schema.pushSubscriptions.userId, job.recipientUserId),
              isNull(schema.pushSubscriptions.disabledAt),
              gt(schema.session.expiresAt, now),
              or(
                isNull(schema.pushSubscriptions.expirationTime),
                gt(schema.pushSubscriptions.expirationTime, now),
              ),
            ),
          )
          .get(),
      )
      if (!subscription) return skip("subscription-unavailable")
      const target: PushTarget = {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime?.getTime() ?? null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }

      if (job.type === "push.comment" || job.type === "push.reply") {
        const comment = yield* query(() =>
          database
            .select({
              id: schema.comments.id,
              authorId: schema.comments.authorId,
              parentId: schema.comments.parentId,
              postId: schema.comments.postId,
              postAuthorId: schema.posts.authorId,
            })
            .from(schema.comments)
            .innerJoin(schema.posts, eq(schema.posts.id, schema.comments.postId))
            .where(
              and(
                eq(schema.comments.id, job.commentId),
                eq(schema.comments.status, "published"),
                eq(schema.posts.status, "published"),
              ),
            )
            .get(),
        )
        if (!comment) return skip("comment-unavailable")

        let expectedRecipientId = comment.postAuthorId
        let preference: "comment" | "reply" = "comment"
        if (job.type === "push.reply") {
          if (!comment.parentId) return skip("not-a-reply")
          const parentId = comment.parentId
          const parent = yield* query(() =>
            database
              .select({ authorId: schema.comments.authorId, parentId: schema.comments.parentId })
              .from(schema.comments)
              .where(and(eq(schema.comments.id, parentId), eq(schema.comments.status, "published")))
              .get(),
          )
          if (!parent || parent.parentId) return skip("parent-unavailable")
          expectedRecipientId = parent.authorId
          preference = "reply"
        }
        if (
          expectedRecipientId !== job.recipientUserId ||
          comment.authorId === job.recipientUserId
        ) {
          return skip("recipient-mismatch")
        }
        const preferences = yield* query(() =>
          database
            .select({
              comment: schema.userSettings.commentPushNotifications,
              reply: schema.userSettings.replyPushNotifications,
            })
            .from(schema.user)
            .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
            .where(eq(schema.user.id, job.recipientUserId))
            .get(),
        )
        const enabled = preference === "reply" ? preferences?.reply : preferences?.comment
        if (!preferences || !notificationEnabled(enabled ?? null)) {
          return skip("preference-disabled")
        }
        return ready(target, {
          title: preference === "reply" ? "New reply" : "New comment",
          body:
            preference === "reply"
              ? "Someone replied to your comment."
              : "Someone commented on your post.",
          url: `/post/${comment.postId}#comment-${comment.id}`,
          tag: `${preference}-${comment.id}`,
        })
      }

      const event = yield* query(() =>
        database
          .select()
          .from(schema.auditEvents)
          .where(eq(schema.auditEvents.id, job.auditEventId))
          .get(),
      )
      if (!event) return skip("event-unavailable")

      if (job.type === "push.moderation") {
        if (event.actorId === job.recipientUserId) return skip("event-unavailable")
        if (event.entityType !== "post" && event.entityType !== "comment") {
          return skip("event-unsupported")
        }
        const owner =
          event.entityType === "post"
            ? yield* query(() =>
                database
                  .select({ userId: schema.posts.authorId, postId: schema.posts.id })
                  .from(schema.posts)
                  .where(eq(schema.posts.id, event.entityId))
                  .get(),
              )
            : yield* query(() =>
                database
                  .select({ userId: schema.comments.authorId, postId: schema.comments.postId })
                  .from(schema.comments)
                  .where(eq(schema.comments.id, event.entityId))
                  .get(),
              )
        if (!owner || owner.userId !== job.recipientUserId) return skip("recipient-mismatch")
        const action = event.action.endsWith(".hide")
          ? "Your content was hidden."
          : event.action.endsWith(".restore")
            ? "Your content was restored."
            : null
        if (!action) return skip("event-unsupported")
        return ready(target, {
          title: "Moderation update",
          body: action,
          url:
            event.entityType === "post"
              ? `/post/${owner.postId}`
              : `/post/${owner.postId}#comment-${event.entityId}`,
          tag: `moderation-${event.id}`,
        })
      }

      if (event.actorId !== job.recipientUserId) return skip("event-unavailable")
      const body =
        event.action === "auth.new-device"
          ? "A new device signed in to your account."
          : event.action === "auth.email-change-requested"
            ? "A change to your account email was requested."
            : event.action === "auth.password-changed" || event.action === "auth.password-reset"
              ? "Your account password changed."
              : null
      if (!body) return skip("event-unsupported")
      return ready(target, {
        title: "Account security",
        body,
        url: "/account/settings/security",
        tag: `security-${event.id}`,
      })
    }),
  })
}
