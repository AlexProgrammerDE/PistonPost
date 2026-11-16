import {
  QueryClient,
  type DefaultError,
  type EnsureQueryDataOptions,
  type QueryKey,
} from "@tanstack/react-query"

/**
 * Route loaders await ensureQueryData, and the route error view cannot show while it retries.
 * Loader reads fail at once unless they choose a retry policy, and component queries keep the
 * default retry policy.
 */
export class RouterQueryClient extends QueryClient {
  override ensureQueryData<
    TQueryFnData,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(options: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>): Promise<TData> {
    return super.ensureQueryData({ ...options, retry: options.retry ?? false })
  }
}
