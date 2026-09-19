import { expect, spyOn, test } from "bun:test"

import { createClockStore } from "./clock-store"

test("shares one clock timer, releases it after the last subscriber, and restarts fresh", () => {
  const start = spyOn(globalThis, "setInterval")
  const stop = spyOn(globalThis, "clearInterval")
  const now = spyOn(Date, "now").mockReturnValue(1_000)
  const clock = createClockStore()
  const cleanups: Array<() => void> = []
  try {
    expect(clock.getServerSnapshot()).toBeNull()
    expect(clock.getSnapshot()).toBeNull()
    let notifications = 0
    cleanups.push(clock.subscribe(() => notifications++))
    cleanups.push(clock.subscribe(() => notifications++))
    expect(start).toHaveBeenCalledTimes(1)
    expect(clock.getSnapshot()).toBe(1_000)
    const tick = start.mock.calls[0]?.[0]
    now.mockReturnValue(31_000)
    if (typeof tick !== "function") throw new Error("Clock timer was not started")
    const beforeTick = notifications
    tick()
    expect(notifications - beforeTick).toBe(2)
    expect(clock.getSnapshot()).toBe(31_000)
    expect(clock.getServerSnapshot()).toBeNull()
    cleanups.pop()?.()
    expect(stop).not.toHaveBeenCalled()
    cleanups.pop()?.()
    expect(stop).toHaveBeenCalledTimes(1)
    now.mockReturnValue(99_000)
    cleanups.push(clock.subscribe(() => notifications++))
    expect(start).toHaveBeenCalledTimes(2)
    expect(clock.getSnapshot()).toBe(99_000)
  } finally {
    for (const cleanup of cleanups) cleanup()
    start.mockRestore()
    stop.mockRestore()
    now.mockRestore()
  }
})
