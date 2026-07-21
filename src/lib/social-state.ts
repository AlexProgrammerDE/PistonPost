export function optimisticHeartCount(
  confirmedCount: number,
  confirmedHasHeart: boolean,
  optimisticHasHeart: boolean,
) {
  return Math.max(0, confirmedCount + Number(optimisticHasHeart) - Number(confirmedHasHeart))
}
