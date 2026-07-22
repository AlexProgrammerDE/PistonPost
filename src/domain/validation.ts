import { z } from "zod"

export const MAX_POST_MARKDOWN_LENGTH = 10_000

export const postMarkdownSchema = z.string().trim().min(1).max(MAX_POST_MARKDOWN_LENGTH)

export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._~-]+$/, "Tags may use letters, numbers, hyphen, dot, underscore, and tilde")

const basePostDraftSchema = z.object({
  title: z.string().trim().min(1).max(100),
  tags: z.array(tagSchema).min(1).max(5),
  visibility: z.enum(["public", "unlisted"]),
})

export const postDraftInputSchema = z.discriminatedUnion("type", [
  basePostDraftSchema.extend({
    type: z.literal("text"),
    textContent: postMarkdownSchema,
  }),
  basePostDraftSchema.extend({
    type: z.literal("images"),
    mediaIds: z.array(z.string().min(1)).max(20),
  }),
  basePostDraftSchema.extend({
    type: z.literal("video"),
    mediaId: z.string().min(1).nullable(),
  }),
])

export const commentInputSchema = z.string().trim().min(1).max(250)
export const notificationPreferenceSchema = z.enum([
  "comment-email",
  "reply-email",
  "product-email",
  "comment-push",
  "reply-push",
])
export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._~-]+$/, "Use letters, numbers, hyphen, dot, underscore, or tilde")

export type PostDraftInput = z.infer<typeof postDraftInputSchema>
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>
