import { z } from "zod"

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
    textContent: z.string().trim().min(1).max(1000),
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
export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._~-]+$/, "Use letters, numbers, hyphen, dot, underscore, or tilde")

export type PostDraftInput = z.infer<typeof postDraftInputSchema>
