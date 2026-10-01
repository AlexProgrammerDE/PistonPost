import { describe, expect, test } from "bun:test"

import { Effect, Result } from "effect"

import { transitionMediaStatus } from "./media-state"

describe("media state", () => {
  test("allows forward progress and idempotent webhook delivery", () => {
    expect(Effect.runSync(transitionMediaStatus("uploading", "processing"))).toBe("processing")
    expect(Effect.runSync(transitionMediaStatus("ready", "ready"))).toBe("ready")
  })

  test("does not resurrect deleted or failed media", () => {
    const deleted = Effect.runSync(Effect.result(transitionMediaStatus("deleted", "ready")))
    const failed = Effect.runSync(Effect.result(transitionMediaStatus("failed", "processing")))
    expect(Result.isFailure(deleted)).toBe(true)
    expect(Result.isFailure(failed)).toBe(true)
  })
})
