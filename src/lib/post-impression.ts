const MAX_MEANINGFUL_VISIBLE_HEIGHT = 320

export type PostExposure = {
  readonly intersectionHeight: number
  readonly isIntersecting: boolean
  readonly targetHeight: number
}

export function isMeaningfulPostExposure({
  intersectionHeight,
  isIntersecting,
  targetHeight,
}: PostExposure) {
  if (!isIntersecting || targetHeight <= 0) return false

  const requiredVisibleHeight = Math.min(targetHeight / 2, MAX_MEANINGFUL_VISIBLE_HEIGHT)
  return intersectionHeight >= requiredVisibleHeight
}
