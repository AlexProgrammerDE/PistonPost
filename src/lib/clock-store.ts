import { createAtom } from "@tanstack/react-store"

export function createClockStore(intervalMs = 30_000) {
  const clock = createAtom<number | null>(null)
  let subscribers = 0
  let interval: ReturnType<typeof setInterval> | undefined

  return {
    getSnapshot: clock.get,
    getServerSnapshot: () => null,
    subscribe: (listener: () => void) => {
      const subscription = clock.subscribe(listener)
      subscribers += 1
      if (subscribers === 1) {
        clock.set(Date.now())
        interval = setInterval(() => clock.set(Date.now()), intervalMs)
      }

      return () => {
        subscription.unsubscribe()
        subscribers -= 1
        if (subscribers === 0) {
          clearInterval(interval)
          interval = undefined
        }
      }
    },
  }
}

export const clockStore = createClockStore()
