import { describe, expect, test } from "bun:test"

import { routeAnnouncement, shouldMoveFocusAfterNavigation } from "./route-announcement"

describe("route announcement", () => {
  test("announces the document title", () => {
    expect(routeAnnouncement("  Settings · PistonPost ", "Settings")).toBe("Settings · PistonPost")
  })

  test("falls back to the first heading when the title is empty", () => {
    expect(routeAnnouncement(" ", " Page not found ")).toBe("Page not found")
  })

  test("still announces a page change without a title or heading", () => {
    expect(routeAnnouncement("", null)).toBe("New page")
    expect(routeAnnouncement("", "   ")).toBe("New page")
  })
})

describe("focus after navigation", () => {
  test("moves focus to the page content when the path changes", () => {
    expect(
      shouldMoveFocusAfterNavigation({ pathChanged: true, hash: "", focusInsideContent: false }),
    ).toBe(true)
  })

  test("keeps focus for search or hash changes on the same page", () => {
    expect(
      shouldMoveFocusAfterNavigation({ pathChanged: false, hash: "", focusInsideContent: false }),
    ).toBe(false)
    expect(
      shouldMoveFocusAfterNavigation({
        pathChanged: false,
        hash: "comments",
        focusInsideContent: false,
      }),
    ).toBe(false)
  })

  test("leaves fragment targets on a new page to the browser and scroll restoration", () => {
    expect(
      shouldMoveFocusAfterNavigation({
        pathChanged: true,
        hash: "comments",
        focusInsideContent: false,
      }),
    ).toBe(false)
  })

  test("keeps focus that the new page already placed inside the content", () => {
    expect(
      shouldMoveFocusAfterNavigation({ pathChanged: true, hash: "", focusInsideContent: true }),
    ).toBe(false)
  })
})
