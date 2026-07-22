export function shouldAutomaticallyLoadNextPage({
  hasNextPage,
  isFetching,
  isFetchNextPageError,
  isPaused,
}: {
  readonly hasNextPage: boolean
  readonly isFetching: boolean
  readonly isFetchNextPageError: boolean
  readonly isPaused: boolean
}) {
  return hasNextPage && !isFetching && !isFetchNextPageError && !isPaused
}
