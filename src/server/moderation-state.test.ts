import { describe, expect, test } from "bun:test"

import { resolveModerationTransition } from "./moderation-state"

describe("moderation transitions", () => {
  test("rejects stale and destructive status changes", () => {
    expect(resolveModerationTransition("published", "hide")).toBe("moderated")
    expect(resolveModerationTransition("moderated", "restore")).toBe("published")
    expect(resolveModerationTransition("moderated", "hide")).toBeNull()
    expect(resolveModerationTransition("published", "restore")).toBeNull()
    expect(resolveModerationTransition("deleted", "restore")).toBeNull()
  })
})
