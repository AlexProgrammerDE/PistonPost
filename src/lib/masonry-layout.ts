/**
 * Balanced masonry placement for image collections.
 *
 * CSS multi-column layout can only split the images into runs, so the first images all go down
 * the first column and the bottom edge stays ragged when a tall image falls at a run boundary.
 * This module places each image under the column that is currently shortest, so the first row
 * reads left to right, then rearranges the last few images so the columns end evenly. The DOM
 * keeps the post order, so screen readers, keyboard focus, and lazy loading follow the author.
 *
 * The layout is expressed in grid rows. A row is a fixed fraction of the column width, so the
 * same row spans work at every viewport width and the server can render the final layout.
 */

export const masonryColumnCounts = [2, 3] as const

export type MasonryColumnCount = (typeof masonryColumnCounts)[number]

export type MasonryImageSize = {
  readonly width: number | null
  readonly height: number | null
}

export type MasonryTile = {
  /** Grid rows the image covers, including the gap below it. */
  readonly rowSpan: number
  /** One-based grid column for each supported column count. */
  readonly columns: Readonly<Record<MasonryColumnCount, number>>
}

export type MasonryLayout = {
  /** Grid rows that equal one column width. */
  readonly rowsPerColumnWidth: number
  /** Grid rows between two stacked images. The column gap uses the same length. */
  readonly gapRows: number
  readonly tiles: readonly MasonryTile[]
}

// Firefox ignores grid lines beyond 10,000. Keep the tallest layout well below that limit.
const maximumRows = 9000
// Finer rows crop less of each image when its height is rounded to whole rows.
const resolutions = [80, 40, 20, 10] as const
// A gap of 1/40 of the column width is 8px for a 320px column.
const gapFraction = 1 / 40

function aspectRatio({ width, height }: MasonryImageSize) {
  // Images without stored dimensions are shown as square crops.
  if (!width || !height || width <= 0 || height <= 0) return 1
  return height / width
}

// The last images decide how ragged the bottom edge is. Searching every column choice for them
// costs at most 4,096 (2 columns) or 6,561 (3 columns) cases.
const balancedTailLength: Readonly<Record<number, number>> = { 2: 12, 3: 8 }

function shortestColumn(columnHeights: readonly number[]) {
  let shortest = 0
  for (let column = 1; column < columnHeights.length; column += 1) {
    // A strict comparison keeps ties on the left, so the first row fills left to right.
    if ((columnHeights[column] ?? 0) < (columnHeights[shortest] ?? 0)) shortest = column
  }
  return shortest
}

/**
 * Places each image under the shortest column, then rearranges only the last few images so the
 * columns end as evenly as possible. Returns zero-based columns and the final column heights.
 */
function placeImages(rowSpans: readonly number[], columnCount: number) {
  const columns: number[] = []
  const columnHeights = Array.from({ length: columnCount }, () => 0)
  for (const rowSpan of rowSpans) {
    const column = shortestColumn(columnHeights)
    columns.push(column)
    columnHeights[column] = (columnHeights[column] ?? 0) + rowSpan
  }

  const tailStart = Math.max(0, rowSpans.length - (balancedTailLength[columnCount] ?? 0))
  const tailSpans = rowSpans.slice(tailStart)
  const greedyTail = columns.slice(tailStart)
  const headHeights = Array.from({ length: columnCount }, () => 0)
  for (const [index, rowSpan] of rowSpans.slice(0, tailStart).entries()) {
    const column = columns[index] ?? 0
    headHeights[column] = (headHeights[column] ?? 0) + rowSpan
  }

  // Prefer the smallest gap between the tallest and shortest column. Among equal gaps, keep as
  // many images as possible where shortest-column placement put them, which preserves the
  // row-by-row reading order.
  let best = { spread: Number.POSITIVE_INFINITY, moved: 0, tail: greedyTail }
  const tail = [...greedyTail]
  const search = (index: number, heights: number[], moved: number) => {
    if (index === tailSpans.length) {
      const spread = Math.max(...heights) - Math.min(...heights)
      if (spread < best.spread || (spread === best.spread && moved < best.moved)) {
        best = { spread, moved, tail: [...tail] }
      }
      return
    }
    const rowSpan = tailSpans[index] ?? 0
    for (let column = 0; column < columnCount; column += 1) {
      tail[index] = column
      heights[column] = (heights[column] ?? 0) + rowSpan
      search(index + 1, heights, moved + (column === greedyTail[index] ? 0 : 1))
      heights[column] = (heights[column] ?? 0) - rowSpan
    }
  }
  search(0, headHeights, 0)

  const placedColumns = [...columns.slice(0, tailStart), ...best.tail]
  const finalHeights = Array.from({ length: columnCount }, () => 0)
  for (const [index, rowSpan] of rowSpans.entries()) {
    const column = placedColumns[index] ?? 0
    finalHeights[column] = (finalHeights[column] ?? 0) + rowSpan
  }
  return { columns: placedColumns, heights: finalHeights }
}

function rowSpansFor(images: readonly MasonryImageSize[], resolution: number, gapRows: number) {
  return images.map((image) => Math.max(1, Math.round(aspectRatio(image) * resolution)) + gapRows)
}

export function createMasonryLayout(images: readonly MasonryImageSize[]): MasonryLayout {
  const fewestColumns = Math.min(...masonryColumnCounts)
  let rowsPerColumnWidth: number = resolutions.at(-1) ?? 10
  for (const resolution of resolutions) {
    const gapRows = Math.max(1, Math.round(resolution * gapFraction))
    const { heights } = placeImages(rowSpansFor(images, resolution, gapRows), fewestColumns)
    if (Math.max(0, ...heights) <= maximumRows) {
      rowsPerColumnWidth = resolution
      break
    }
  }

  const gapRows = Math.max(1, Math.round(rowsPerColumnWidth * gapFraction))
  const rowSpans = rowSpansFor(images, rowsPerColumnWidth, gapRows)
  const placementsByCount = new Map(
    masonryColumnCounts.map((count) => [count, placeImages(rowSpans, count).columns] as const),
  )

  return {
    rowsPerColumnWidth,
    gapRows,
    tiles: rowSpans.map((rowSpan, index) => ({
      rowSpan,
      columns: {
        2: (placementsByCount.get(2)?.[index] ?? 0) + 1,
        3: (placementsByCount.get(3)?.[index] ?? 0) + 1,
      },
    })),
  }
}
