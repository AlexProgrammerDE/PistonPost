import { Data, Effect } from "effect"

export type MediaStatus = "pending" | "uploading" | "processing" | "ready" | "failed" | "deleted"

const allowedTransitions: Readonly<Record<MediaStatus, ReadonlySet<MediaStatus>>> = {
  pending: new Set(["pending", "uploading", "processing", "ready", "failed", "deleted"]),
  uploading: new Set(["uploading", "processing", "ready", "failed", "deleted"]),
  processing: new Set(["processing", "ready", "failed", "deleted"]),
  ready: new Set(["ready", "deleted"]),
  failed: new Set(["failed", "deleted"]),
  deleted: new Set(["deleted"]),
}

export class InvalidMediaTransition extends Data.TaggedError("InvalidMediaTransition")<{
  readonly current: MediaStatus
  readonly next: MediaStatus
}> {}

export function transitionMediaStatus(current: MediaStatus, next: MediaStatus) {
  return allowedTransitions[current].has(next)
    ? Effect.succeed(next)
    : Effect.fail(new InvalidMediaTransition({ current, next }))
}
