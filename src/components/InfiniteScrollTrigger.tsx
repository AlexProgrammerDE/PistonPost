"use client"

import { History, RotateCcw, WifiOff } from "lucide-react"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

const PRELOAD_MARGIN = "0px 0px 2000px 0px"

export function InfiniteScrollTrigger({
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  isFetchNextPageError,
  isPaused,
  onLoadMore,
}: {
  readonly hasNextPage: boolean
  readonly isFetching: boolean
  readonly isFetchingNextPage: boolean
  readonly isFetchNextPageError: boolean
  readonly isPaused: boolean
  readonly onLoadMore: () => Promise<unknown>
}) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const canAutomaticallyLoad = hasNextPage && !isFetching && !isFetchNextPageError && !isPaused

  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger || !canAutomaticallyLoad || typeof IntersectionObserver === "undefined") {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void onLoadMore()
      },
      { rootMargin: PRELOAD_MARGIN },
    )

    observer.observe(trigger)
    return () => observer.disconnect()
  }, [canAutomaticallyLoad, onLoadMore])

  if (!hasNextPage) return null

  const label = isPaused
    ? "Waiting for a connection…"
    : isFetchNextPageError
      ? "Try loading older posts again"
      : isFetchingNextPage
        ? "Loading posts…"
        : "Load older posts"
  const ActionIcon = isPaused ? WifiOff : isFetchNextPageError ? RotateCcw : History

  return (
    <div ref={triggerRef} className="mt-10 flex justify-center">
      <Button variant="outline" disabled={isFetching || isPaused} onClick={() => void onLoadMore()}>
        {isFetchingNextPage ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : (
          <ActionIcon aria-hidden="true" data-icon="inline-start" />
        )}
        {label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {isFetchingNextPage
          ? "Loading older posts."
          : isFetchNextPageError
            ? "Older posts could not be loaded."
            : ""}
      </span>
    </div>
  )
}
