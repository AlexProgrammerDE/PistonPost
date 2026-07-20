import { clsx } from "clsx"
import type { ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDeviceLanguage() {
  return navigator.language.split("-", 1)[0]
}

export function noop() {}

type PlayerEventTarget = {
  addEventListener(type: string, listener: EventListener): unknown
  removeEventListener(type: string, listener: EventListener): unknown
}

export function off(
  element: PlayerEventTarget,
  events: string | ReadonlyArray<string>,
  callback: EventListener,
) {
  const eventNames = typeof events === "string" ? [events] : events
  for (const eventName of eventNames) element.removeEventListener(eventName, callback)
  return element
}

export function on(
  element: PlayerEventTarget,
  events: string | ReadonlyArray<string>,
  callback: EventListener,
) {
  const eventNames = typeof events === "string" ? [events] : events
  for (const eventName of eventNames) element.addEventListener(eventName, callback)
  return element
}

export function toFixedNumber(value: number, digits: number, base = 10) {
  const factor = base ** digits
  return Math.round(value * factor) / factor
}
