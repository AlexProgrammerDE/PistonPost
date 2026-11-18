import { describe, expect, test } from "bun:test"

import { getTurnstileWidgetSize } from "./turnstile-widget-size"

describe("Turnstile widget size", () => {
  test("uses the compact widget when the form is narrower than the flexible minimum", () => {
    expect(getTurnstileWidgetSize(232)).toBe("compact")
    expect(getTurnstileWidgetSize(299)).toBe("compact")
  })

  test("fills the form with the flexible widget when it fits", () => {
    expect(getTurnstileWidgetSize(300)).toBe("flexible")
    expect(getTurnstileWidgetSize(398)).toBe("flexible")
  })
})
