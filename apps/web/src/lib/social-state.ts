export const reactionTypes = ["like", "dislike", "heart"] as const
export type ReactionType = (typeof reactionTypes)[number]
export type ReactionCounts = Record<ReactionType, number>

export function applyOptimisticReaction(
  current: ReactionType[],
  update: { type: ReactionType; active: boolean },
) {
  return update.active
    ? [...new Set([...current, update.type])]
    : current.filter((type) => type !== update.type)
}

export function optimisticReactionCounts(
  confirmedCounts: ReactionCounts,
  confirmedActive: ReactionType[],
  optimisticActive: ReactionType[],
) {
  return reactionTypes.reduce<ReactionCounts>(
    (next, type) => {
      next[type] = Math.max(
        0,
        confirmedCounts[type] +
          Number(optimisticActive.includes(type)) -
          Number(confirmedActive.includes(type)),
      )
      return next
    },
    { like: 0, dislike: 0, heart: 0 },
  )
}
