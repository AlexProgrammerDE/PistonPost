import { Schema } from "effect"

export const MAX_POST_MARKDOWN_LENGTH = 10_000
export const MAX_IMAGES_PER_POST = 150

export const postMarkdownSchema = Schema.Trim.check(Schema.isMinLength(1)).check(
  Schema.isMaxLength(MAX_POST_MARKDOWN_LENGTH),
)

export const tagSchema = Schema.Trim.check(Schema.isMinLength(1))
  .check(Schema.isMaxLength(64))
  .check(
    Schema.isPattern(/^[A-Za-z0-9._~-]+$/, {
      message: "Tags may use letters, numbers, hyphen, dot, underscore, and tilde",
    }),
  )

const basePostDraftSchema = Schema.Struct({
  title: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(100)),
  tags: Schema.mutable(Schema.Array(tagSchema))
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(5)),
  visibility: Schema.Literals(["public", "unlisted"]),
})

export const postDraftInputSchema = Schema.Union([
  basePostDraftSchema.pipe(
    Schema.fieldsAssign({
      type: Schema.Literal("text"),
      textContent: postMarkdownSchema,
    }),
  ),
  basePostDraftSchema.pipe(
    Schema.fieldsAssign({
      type: Schema.Literal("images"),
      mediaIds: Schema.mutable(Schema.Array(Schema.String.check(Schema.isMinLength(1)))).check(
        Schema.isMaxLength(MAX_IMAGES_PER_POST),
      ),
    }),
  ),
  basePostDraftSchema.pipe(
    Schema.fieldsAssign({
      type: Schema.Literal("video"),
      mediaId: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
    }),
  ),
])

export const commentInputSchema = Schema.Trim.check(Schema.isMinLength(1)).check(
  Schema.isMaxLength(250),
)
export const emailNotificationPreferences = [
  "comment-email",
  "reply-email",
  "product-email",
] as const
export const emailNotificationPreferenceSchema = Schema.Literals(emailNotificationPreferences)
export const notificationPreferenceSchema = Schema.Literals([
  ...emailNotificationPreferences,
  "comment-push",
  "reply-push",
])
export const usernameSchema = Schema.Trim.check(Schema.isMinLength(1))
  .check(Schema.isMaxLength(32))
  .check(
    Schema.isPattern(/^[A-Za-z0-9._~-]+$/, {
      message: "Use letters, numbers, hyphen, dot, underscore, or tilde",
    }),
  )

export type EmailNotificationPreference = (typeof emailNotificationPreferenceSchema)["Type"]
export type NotificationPreference = (typeof notificationPreferenceSchema)["Type"]
