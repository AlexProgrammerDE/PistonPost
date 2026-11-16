import { Schema } from "effect"

export const MAX_POST_MARKDOWN_LENGTH = 10_000
export const MAX_IMAGES_PER_POST = 150

export const postMarkdownSchema = Schema.Trim.check(Schema.isMinLength(1)).check(
  Schema.isMaxLength(MAX_POST_MARKDOWN_LENGTH),
)

/** Names made only of dots become "." or ".." path segments and break their URLs. */
const notOnlyDots = Schema.makeFilter(
  (value: string) =>
    !/^\.+$/.test(value) || "Use at least one letter, number, or symbol other than a dot",
)

export const tagSchema = Schema.Trim.check(Schema.isMinLength(1))
  .check(Schema.isMaxLength(64))
  .check(
    Schema.isPattern(/^[A-Za-z0-9._~-]+$/, {
      message: "Tags may use letters, numbers, hyphen, dot, underscore, and tilde",
    }),
  )
  .check(notOnlyDots)

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
export const MAX_USERNAME_LENGTH = 32
const USERNAME_PATTERN = /^[A-Za-z0-9._~-]+$/

export const usernameSchema = Schema.Trim.check(Schema.isMinLength(1))
  .check(Schema.isMaxLength(MAX_USERNAME_LENGTH))
  .check(
    Schema.isPattern(USERNAME_PATTERN, {
      message: "Use letters, numbers, hyphen, dot, underscore, or tilde",
    }),
  )
  .check(notOnlyDots)

/** Check an already-trimmed username with the same rules as `usernameSchema`. */
export function isValidUsername(value: string) {
  return (
    value.length >= 1 &&
    value.length <= MAX_USERNAME_LENGTH &&
    USERNAME_PATTERN.test(value) &&
    !/^\.+$/.test(value)
  )
}

export type EmailNotificationPreference = (typeof emailNotificationPreferenceSchema)["Type"]
export type NotificationPreference = (typeof notificationPreferenceSchema)["Type"]

function isWebLink(value: string) {
  if (!URL.canParse(value)) return false
  const { protocol } = new URL(value)
  return protocol === "http:" || protocol === "https:"
}

/** An empty string clears the website. Other values must be http or https links. */
export const profileWebsiteSchema = Schema.Union([
  Schema.Literal(""),
  Schema.String.check(
    Schema.makeFilter((value: string) => isWebLink(value) || "Use an http or https link"),
  ).check(Schema.isMaxLength(500)),
])
