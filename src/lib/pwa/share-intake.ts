import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { IMAGE_UPLOAD_MIME_TYPES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/uploads/image-upload-policy"

export const MAX_SHARED_FILES = 20
export const MAX_SHARED_BYTES = 50 * 1024 * 1024
export const SHARE_RETENTION_MS = 60 * 60 * 1000
export const MAX_PENDING_SHARES = 3

const sharedFileSchema = Schema.instanceOf(File).check(
  Schema.makeFilter(
    (file) =>
      (file.size > 0 &&
        file.size <= MAX_IMAGE_UPLOAD_BYTES &&
        (IMAGE_UPLOAD_MIME_TYPES.some((type) => type === file.type) ||
          (file.type === "" && /\.(?:jpe?g|png|gif|webp|avif)$/i.test(file.name)))) ||
      "Share JPEG, PNG, GIF, WebP, or AVIF images no larger than 15 MB each.",
  ),
)

export const sharedContentSchema = Schema.Struct({
  title: Schema.String.check(Schema.isMaxLength(100)).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => "" as const)),
  ),
  text: Schema.String.check(Schema.isMaxLength(10_000)).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => "" as const)),
  ),
  url: Schema.String.check(Schema.isMaxLength(2048))
    .check(
      Schema.makeFilter((value) => {
        if (!value) return true
        try {
          return ["http:", "https:"].includes(new URL(value).protocol)
        } catch {
          return false
        }
      }),
    )
    .pipe(Schema.withDecodingDefaultType(Effect.sync(() => "" as const))),
  files: Schema.mutable(Schema.Array(sharedFileSchema))
    .check(Schema.isMaxLength(MAX_SHARED_FILES))
    .pipe(Schema.withDecodingDefaultType(Effect.sync(() => []))),
})
  .check(
    Schema.makeFilter(
      (value) =>
        value.files.reduce((size, file) => size + file.size, 0) <= MAX_SHARED_BYTES ||
        "Share no more than 50 MB at a time.",
    ),
  )
  .check(
    Schema.makeFilter(
      (value) =>
        Boolean(value.title || value.text || value.url || value.files.length) ||
        "There is nothing to share.",
    ),
  )
  .check(
    Schema.makeFilter(
      (value) =>
        [value.text, value.url].filter(Boolean).join("\n\n").length <= 10_000 ||
        "Shared text and links must fit within 10,000 characters.",
    ),
  )

export type SharedContent = (typeof sharedContentSchema)["Type"]

export const pendingShareSchema = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  ownerId: Schema.NullOr(Schema.String),
  createdAt: Schema.Finite,
  content: sharedContentSchema,
})
export type PendingShare = (typeof pendingShareSchema)["Type"]

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
