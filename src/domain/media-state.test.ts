import { describe, expect, test } from "bun:test"

import { Effect, Either } from "effect"

import { transitionMediaStatus } from "./media-state"

describe("media state", () => {
  test("allows forward progress and idempotent webhook delivery", () => {
    expect(Effect.runSync(transitionMediaStatus("uploading", "processing"))).toBe("processing")
    expect(Effect.runSync(transitionMediaStatus("ready", "ready"))).toBe("ready")
  })

  test("does not resurrect deleted or failed media", () => {
    const deleted = Effect.runSync(Effect.either(transitionMediaStatus("deleted", "ready")))
    const failed = Effect.runSync(Effect.either(transitionMediaStatus("failed", "processing")))
    expect(Either.isLeft(deleted)).toBe(true)
    expect(Either.isLeft(failed)).toBe(true)
  })
})
