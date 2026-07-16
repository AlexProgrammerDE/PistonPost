import { describe, expect, it } from "bun:test"

import { observedVerticalPosition, shouldShowPostActionDock } from "./post-action-dock"

describe("post action dock", () => {
  it("classifies observed elements around the viewport", () => {
    expect(observedVerticalPosition({ isIntersecting: true, top: 40, bottom: 60 })).toBe("visible")
    expect(observedVerticalPosition({ isIntersecting: false, top: -20, bottom: -1 })).toBe("above")
    expect(observedVerticalPosition({ isIntersecting: false, top: 900, bottom: 940 })).toBe("below")
  })

  it("shows only between the media start and the footer controls", () => {
    expect(shouldShowPostActionDock("above", "below")).toBe(true)
    expect(shouldShowPostActionDock("visible", "below")).toBe(false)
    expect(shouldShowPostActionDock("above", "visible")).toBe(false)
    expect(shouldShowPostActionDock("above", "above")).toBe(false)
  })
})
