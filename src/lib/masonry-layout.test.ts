import { describe, expect, test } from "bun:test"

import { createMasonryLayout, type MasonryColumnCount } from "./masonry-layout"

const portrait = { width: 600, height: 900 }
const landscape = { width: 900, height: 600 }
const square = { width: 800, height: 800 }

function columnHeights(
  layout: ReturnType<typeof createMasonryLayout>,
  columnCount: MasonryColumnCount,
) {
  const heights = Array.from({ length: columnCount }, () => 0)
  for (const tile of layout.tiles) {
    const column = tile.columns[columnCount] - 1
    heights[column] = (heights[column] ?? 0) + tile.rowSpan
  }
  return heights
}

/** Mimics two CSS columns: the most even split of the images into consecutive runs. */
function runColumnHeights(layout: ReturnType<typeof createMasonryLayout>) {
  const spans = layout.tiles.map((tile) => tile.rowSpan)
  const total = spans.reduce((sum, span) => sum + span, 0)
  let best = [0, total]
  let first = 0
  for (const span of spans) {
    first += span
    if (Math.abs(total - 2 * first) < Math.abs((best[1] ?? 0) - (best[0] ?? 0))) {
      best = [first, total - first]
    }
  }
  return best
}

describe("createMasonryLayout", () => {
  test("ends the columns of a mixed gallery level with each other", () => {
    // Portraits first and landscapes last leaves a ragged edge when images are split into runs.
    const layout = createMasonryLayout(
      [
        [600, 900],
        [600, 1000],
        [700, 1000],
        [600, 800],
        [900, 600],
        [1000, 600],
        [1200, 700],
        [900, 700],
        [1000, 1000],
        [800, 1200],
        [1200, 800],
        [900, 600],
      ].map(([width, height]) => ({ width: width ?? 0, height: height ?? 0 })),
    )

    for (const columnCount of [2, 3] as const) {
      const heights = columnHeights(layout, columnCount)
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(layout.gapRows)
    }
    const runs = runColumnHeights(layout)
    expect(Math.max(...runs) - Math.min(...runs)).toBeGreaterThan(layout.gapRows)
  })

  test("fills the first row from left to right", () => {
    const layout = createMasonryLayout([square, square, square, square])

    expect(layout.tiles.map((tile) => tile.columns[3])).toEqual([1, 2, 3, 1])
    expect(layout.tiles.map((tile) => tile.columns[2])).toEqual([1, 2, 1, 2])
  })

  test("places the next image under the shortest column", () => {
    const layout = createMasonryLayout([portrait, landscape, landscape])

    // The two landscape images together are shorter than the portrait image beside them.
    expect(layout.tiles.map((tile) => tile.columns[2])).toEqual([1, 2, 2])
  })

  test("sizes each tile from its aspect ratio plus the gap", () => {
    const layout = createMasonryLayout([portrait, landscape])
    const resolution = layout.rowsPerColumnWidth

    expect(layout.tiles.map((tile) => tile.rowSpan)).toEqual([
      resolution * 1.5 + layout.gapRows,
      Math.round((resolution * 2) / 3) + layout.gapRows,
    ])
  })

  test("shows images without stored dimensions as squares", () => {
    const layout = createMasonryLayout([
      { width: null, height: null },
      { width: 0, height: 400 },
    ])

    for (const tile of layout.tiles) {
      expect(tile.rowSpan).toBe(layout.rowsPerColumnWidth + layout.gapRows)
    }
  })

  test("uses coarser rows for very large galleries to stay within browser grid limits", () => {
    const small = createMasonryLayout(Array.from({ length: 12 }, () => portrait))
    const large = createMasonryLayout(Array.from({ length: 400 }, () => portrait))

    expect(large.rowsPerColumnWidth).toBeLessThan(small.rowsPerColumnWidth)
    expect(Math.max(...columnHeights(large, 2))).toBeLessThanOrEqual(9000)
  })
})
