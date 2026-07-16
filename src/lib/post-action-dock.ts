export type ObservedVerticalPosition = "above" | "visible" | "below"

export function observedVerticalPosition({
  isIntersecting,
  top,
  bottom,
}: {
  readonly isIntersecting: boolean
  readonly top: number
  readonly bottom: number
}): ObservedVerticalPosition {
  if (isIntersecting) return "visible"
  if (bottom <= 0) return "above"
  if (top >= 0) return "below"
  return "visible"
}

export function shouldShowPostActionDock(
  contentStart: ObservedVerticalPosition,
  footerActions: ObservedVerticalPosition,
) {
  return contentStart === "above" && footerActions === "below"
}
