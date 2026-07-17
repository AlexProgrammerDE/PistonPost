export const AUTOMATIC_PAGE_LIMIT = 2

export function shouldAutomaticallyLoadNextPage({
  hasNextPage,
  loadedPageCount,
  isContinuousLoadingEnabled,
  isFetching,
  isFetchNextPageError,
  isPaused,
}: {
  readonly hasNextPage: boolean
  readonly loadedPageCount: number
  readonly isContinuousLoadingEnabled: boolean
  readonly isFetching: boolean
  readonly isFetchNextPageError: boolean
  readonly isPaused: boolean
}) {
  return (
    hasNextPage &&
    (loadedPageCount < AUTOMATIC_PAGE_LIMIT || isContinuousLoadingEnabled) &&
    !isFetching &&
    !isFetchNextPageError &&
    !isPaused
  )
}
