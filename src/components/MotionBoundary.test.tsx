import { describe, expect, test } from "bun:test"

import { MotionBoundary } from "./MotionBoundary"

describe("MotionBoundary", () => {
  test("loads features lazily and respects reduced-motion preferences", () => {
    const child = <span>Animated content</span>
    const boundary = MotionBoundary({ children: child })
    const config = boundary.props.children

    expect(boundary.props.strict).toBe(true)
    expect(boundary.props.features).toBeFunction()
    expect(config.props.reducedMotion).toBe("user")
    expect(config.props.children).toBe(child)
  })
})
