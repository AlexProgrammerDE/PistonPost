import { describe, expect, it } from "bun:test"

import { isMeaningfulPostExposure } from "./post-impression"

describe("post impression visibility", () => {
  it("requires a post to intersect the viewport", () => {
    expect(
      isMeaningfulPostExposure({
        intersectionHeight: 400,
        isIntersecting: false,
        targetHeight: 400,
      }),
    ).toBe(false)
  })

  it("requires half of a normal post to be visible", () => {
    expect(
      isMeaningfulPostExposure({
        intersectionHeight: 199,
        isIntersecting: true,
        targetHeight: 400,
      }),
    ).toBe(false)
    expect(
      isMeaningfulPostExposure({
        intersectionHeight: 200,
        isIntersecting: true,
        targetHeight: 400,
      }),
    ).toBe(true)
  })

  it("caps the required visible area for posts taller than the viewport", () => {
    expect(
      isMeaningfulPostExposure({
        intersectionHeight: 319,
        isIntersecting: true,
        targetHeight: 1_200,
      }),
    ).toBe(false)
    expect(
      isMeaningfulPostExposure({
        intersectionHeight: 320,
        isIntersecting: true,
        targetHeight: 1_200,
      }),
    ).toBe(true)
  })
})
