import { describe, expect, test } from "bun:test"

import { applyOptimisticReaction, optimisticReactionCounts } from "./social-state"

describe("optimistic social state", () => {
  test("keeps the three legacy reaction types independent", () => {
    const liked = applyOptimisticReaction([], { type: "like", active: true })
    const alsoDisliked = applyOptimisticReaction(liked, { type: "dislike", active: true })

    expect(alsoDisliked).toEqual(["like", "dislike"])
    expect(applyOptimisticReaction(alsoDisliked, { type: "like", active: false })).toEqual([
      "dislike",
    ])
  })

  test("derives pending counts without mutating the confirmed rollback baseline", () => {
    const confirmed = { like: 4, dislike: 1, heart: 2 }
    const optimistic = optimisticReactionCounts(confirmed, ["heart"], ["like", "heart"])

    expect(optimistic).toEqual({ like: 5, dislike: 1, heart: 2 })
    expect(optimisticReactionCounts(confirmed, ["heart"], ["heart"])).toEqual(confirmed)
  })
})
