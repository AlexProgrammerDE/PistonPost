import { describe, expect, test } from "bun:test"

import {
  hiddenColumnIds,
  parseCursorTrail,
  pistonPostTableFeatures,
  popCursorTrail,
  pushCursorTrail,
} from "./app-table"

describe("shared Table v9 adapter", () => {
  test("registers only the application features used by dashboard tables", () => {
    expect(Object.keys(pistonPostTableFeatures).toSorted()).toEqual(
      [
        "columnFilteringFeature",
        "columnResizingFeature",
        "columnSizingFeature",
        "columnVisibilityFeature",
        "filterFns",
        "filteredRowModel",
        "globalFilteringFeature",
        "paginatedRowModel",
        "rowPaginationFeature",
        "rowSelectionFeature",
        "rowSortingFeature",
        "sortFns",
        "sortedRowModel",
      ].toSorted(),
    )
  })

  test("serializes column visibility deterministically for URL state", () => {
    expect(hiddenColumnIds({ status: false, primary: true, secondary: false })).toEqual([
      "secondary",
      "status",
    ])
  })

  test("round-trips cursor pagination history including the first page", () => {
    const firstAdvance = pushCursorTrail([], "")
    const secondAdvance = pushCursorTrail(firstAdvance, "cursor-two")

    expect(parseCursorTrail(secondAdvance.join(","))).toEqual(["_", "cursor-two"])
    expect(popCursorTrail(secondAdvance)).toEqual({ cursor: "cursor-two", trail: ["_"] })
    expect(popCursorTrail(["_"])).toEqual({ cursor: "", trail: [] })
  })
})
