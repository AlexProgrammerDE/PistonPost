/** Turnstile's normal and flexible widgets need at least this many pixels of width. */
const TURNSTILE_MIN_FLEXIBLE_WIDTH = 300

export type TurnstileWidgetSize = "flexible" | "compact"

/**
 * Pick a widget size that fits the available width. The flexible widget fills
 * the form on wider screens; the compact widget keeps narrow phones from
 * clipping the challenge.
 */
export function getTurnstileWidgetSize(availableWidth: number): TurnstileWidgetSize {
  return availableWidth < TURNSTILE_MIN_FLEXIBLE_WIDTH ? "compact" : "flexible"
}
