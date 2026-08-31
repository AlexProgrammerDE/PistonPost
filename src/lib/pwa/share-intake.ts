import { z } from "zod"

import { IMAGE_UPLOAD_MIME_TYPES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/uploads/image-upload-policy"

export const MAX_SHARED_FILES = 20
export const MAX_SHARED_BYTES = 50 * 1024 * 1024
export const SHARE_RETENTION_MS = 60 * 60 * 1000
export const MAX_PENDING_SHARES = 3

const sharedFileSchema = z
  .instanceof(File)
  .refine(
    (file) =>
      file.size > 0 &&
      file.size <= MAX_IMAGE_UPLOAD_BYTES &&
      (IMAGE_UPLOAD_MIME_TYPES.some((type) => type === file.type) ||
        (file.type === "" && /\.(?:jpe?g|png|gif|webp|avif)$/i.test(file.name))),
    "Share JPEG, PNG, GIF, WebP, or AVIF images no larger than 15 MB each.",
  )

export const sharedContentSchema = z
  .object({
    title: z.string().max(100).default(""),
    text: z.string().max(10_000).default(""),
    url: z
      .string()
      .max(2048)
      .refine((value) => {
        if (!value) return true
        try {
          return ["http:", "https:"].includes(new URL(value).protocol)
        } catch {
          return false
        }
      })
      .default(""),
    files: z.array(sharedFileSchema).max(MAX_SHARED_FILES).default([]),
  })
  .refine(
    (value) => value.files.reduce((size, file) => size + file.size, 0) <= MAX_SHARED_BYTES,
    "Share no more than 50 MB at a time.",
  )
  .refine(
    (value) => Boolean(value.title || value.text || value.url || value.files.length),
    "There is nothing to share.",
  )
  .refine(
    (value) => [value.text, value.url].filter(Boolean).join("\n\n").length <= 10_000,
    "Shared text and links must fit within 10,000 characters.",
  )

export type SharedContent = z.infer<typeof sharedContentSchema>

export const pendingShareSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().nullable(),
  createdAt: z.number(),
  content: sharedContentSchema,
})
export type PendingShare = z.infer<typeof pendingShareSchema>

export function sharedText(content: SharedContent) {
  return [content.text, content.url].filter(Boolean).join("\n\n")
}

export function isShareAvailable(share: PendingShare, userId: string | null, now = Date.now()) {
  return (
    share.createdAt <= now &&
    now - share.createdAt < SHARE_RETENTION_MS &&
    (share.ownerId === null || share.ownerId === userId)
  )
}
