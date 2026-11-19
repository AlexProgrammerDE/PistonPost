import { Effect, Schema } from "effect"

const mediaStatusSchema = Schema.Literals([
  "pending",
  "uploading",
  "processing",
  "ready",
  "failed",
  "deleted",
])

export type MediaStatus = typeof mediaStatusSchema.Type

const allowedTransitions: Readonly<Record<MediaStatus, ReadonlySet<MediaStatus>>> = {
  pending: new Set(["pending", "uploading", "processing", "ready", "failed", "deleted"]),
  uploading: new Set(["uploading", "processing", "ready", "failed", "deleted"]),
  processing: new Set(["processing", "ready", "failed", "deleted"]),
  ready: new Set(["ready", "deleted"]),
  failed: new Set(["failed", "deleted"]),
  deleted: new Set(["deleted"]),
}

export class InvalidMediaTransition extends Schema.TaggedError<
  InvalidMediaTransition,
  { readonly brand: unique symbol }
>()("InvalidMediaTransition", { current: mediaStatusSchema, next: mediaStatusSchema }) {}

export function transitionMediaStatus(current: MediaStatus, next: MediaStatus) {
  return allowedTransitions[current].has(next)
    ? Effect.succeed(next)
    : Effect.fail(InvalidMediaTransition.make({ current, next }))
}
