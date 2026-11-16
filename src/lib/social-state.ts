export function optimisticHeartCount(
  confirmedCount: number,
  confirmedHasHeart: boolean,
  optimisticHasHeart: boolean,
) {
  return Math.max(0, confirmedCount + Number(optimisticHasHeart) - Number(confirmedHasHeart))
}

/** Describes a heart count for screen readers, since the visible count is only a number. */
export function heartCountLabel(count: number) {
  return count === 1 ? "1 heart" : `${count} hearts`
}
