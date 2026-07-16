"use client"

import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  type ColumnDef,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, SearchX } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const pistonPostTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
  filterFns,
})

export const { useAppTable, createAppColumnHelper } = createTableHook({
  features: pistonPostTableFeatures,
  tableComponents: {},
  cellComponents: {},
  headerComponents: {},
})

export type DataTableUrlState = {
  sort: string
  direction: "asc" | "desc"
  page: number
  hidden: string[]
}

export type DataTableCursorPagination = {
  page: number
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
}

export function hiddenColumnIds(state: ColumnVisibilityState) {
  return Object.entries(state)
    .filter(([, visible]) => !visible)
    .map(([id]) => id)
    .toSorted()
}

export function parseCursorTrail(value: string) {
  return value ? value.split(",").filter(Boolean) : []
}

export function pushCursorTrail(trail: string[], currentCursor: string) {
  return [...trail, currentCursor || "_"]
}

export function popCursorTrail(trail: string[]) {
  const encodedCursor = trail.at(-1)
  return {
    cursor: encodedCursor === "_" || encodedCursor === undefined ? "" : encodedCursor,
    trail: trail.slice(0, -1),
  }
}

export function DataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  emptyMessage = "No results match this view.",
  urlState,
  onUrlStateChange,
  cursorPagination,
  showColumnControls = false,
}: {
  data: TData[]
  columns: Array<ColumnDef<typeof pistonPostTableFeatures, TData>>
  getRowId: (row: TData) => string
  emptyMessage?: string
  urlState?: DataTableUrlState
  onUrlStateChange?: (next: DataTableUrlState) => void
  cursorPagination?: DataTableCursorPagination
  showColumnControls?: boolean
}) {
  const sorting: SortingState = urlState?.sort
    ? [{ id: urlState.sort, desc: urlState.direction === "desc" }]
    : []
  const pagination: PaginationState = { pageIndex: urlState?.page ?? 0, pageSize: 20 }
  const columnVisibility: ColumnVisibilityState = Object.fromEntries(
    (urlState?.hidden ?? []).map((id) => [id, false]),
  )
  const table = useAppTable(
    {
      data,
      columns,
      getRowId,
      initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
      manualPagination: cursorPagination !== undefined,
      manualSorting: cursorPagination !== undefined,
      ...(urlState
        ? {
            state: {
              sorting,
              pagination: cursorPagination ? { pageIndex: 0, pageSize: 20 } : pagination,
              columnVisibility,
            },
            onSortingChange: (updater) => {
              const next = typeof updater === "function" ? updater(sorting) : updater
              const first = next[0]
              onUrlStateChange?.({
                ...urlState,
                sort: first?.id ?? "",
                direction: first?.desc ? "desc" : "asc",
                page: 0,
              })
            },
            onPaginationChange: (updater) => {
              const next = typeof updater === "function" ? updater(pagination) : updater
              onUrlStateChange?.({ ...urlState, page: next.pageIndex })
            },
            onColumnVisibilityChange: (updater) => {
              const next = typeof updater === "function" ? updater(columnVisibility) : updater
              onUrlStateChange?.({
                ...urlState,
                hidden: hiddenColumnIds(next),
              })
            },
          }
        : {}),
    },
    (state) => ({ pagination: state.pagination }),
  )
  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide())
  const hasPagination = cursorPagination
    ? cursorPagination.hasPrevious || cursorPagination.hasNext
    : table.getPageCount() > 1

  return (
    <table.AppTable>
      {showColumnControls && hideableColumns.length > 1 ? (
        <div className="mb-3 flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3 aria-hidden="true" data-icon="inline-start" />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuGroup>
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked)}
                  >
                    {typeof column.columnDef.header === "string"
                      ? column.columnDef.header
                      : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <div className="border-y">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-primary"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp aria-hidden="true" className="size-3.5" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown aria-hidden="true" className="size-3.5" />
                        ) : null}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {table.getRowModel().rows.length === 0 ? (
          <Empty className="min-h-56">
            <EmptyHeader>
              <EmptyMedia>
                <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>No results</EmptyTitle>
              <EmptyDescription>{emptyMessage}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
      {hasPagination ? (
        <table.Subscribe selector={(state) => state.pagination}>
          {(paginationState) => (
            <div className="mt-4 flex items-center justify-between gap-4 text-sm">
              <p className="text-muted-foreground">
                Page {cursorPagination?.page ?? paginationState.pageIndex + 1}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    cursorPagination ? !cursorPagination.hasPrevious : !table.getCanPreviousPage()
                  }
                  onClick={() =>
                    cursorPagination ? cursorPagination.onPrevious() : table.previousPage()
                  }
                >
                  <ChevronLeft aria-hidden="true" data-icon="inline-start" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cursorPagination ? !cursorPagination.hasNext : !table.getCanNextPage()}
                  onClick={() => (cursorPagination ? cursorPagination.onNext() : table.nextPage())}
                >
                  Next
                  <ChevronRight aria-hidden="true" data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}
        </table.Subscribe>
      ) : null}
    </table.AppTable>
  )
}
