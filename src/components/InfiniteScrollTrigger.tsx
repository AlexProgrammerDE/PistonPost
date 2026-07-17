"use client"

import { History, RotateCcw, WifiOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AUTOMATIC_PAGE_LIMIT, shouldAutomaticallyLoadNextPage } from "@/lib/infinite-scroll"

const PRELOAD_MARGIN = "0px 0px 2000px 0px"

export function InfiniteScrollTrigger({
  hasNextPage,
  loadedPageCount,
  isFetching,
  isFetchingNextPage,
  isFetchNextPageError,
  isPaused,
  nextPageHref,
  onLoadMore,
}: {
  readonly hasNextPage: boolean
  readonly loadedPageCount: number
  readonly isFetching: boolean
  readonly isFetchingNextPage: boolean
  readonly isFetchNextPageError: boolean
  readonly isPaused: boolean
  readonly nextPageHref?: string
  readonly onLoadMore: () => Promise<unknown>
}) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const [isContinuousLoadingEnabled, setIsContinuousLoadingEnabled] = useState(false)
  const isAtAutomaticLoadingBarrier =
    loadedPageCount >= AUTOMATIC_PAGE_LIMIT && !isContinuousLoadingEnabled
  const canAutomaticallyLoad = shouldAutomaticallyLoadNextPage({
    hasNextPage,
    loadedPageCount,
    isContinuousLoadingEnabled,
    isFetching,
    isFetchNextPageError,
    isPaused,
  })

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

  const handleLoadMore = () => {
    if (isAtAutomaticLoadingBarrier) {
      setIsContinuousLoadingEnabled(true)
      if (!isFetchNextPageError && typeof IntersectionObserver !== "undefined") return
    }

    void onLoadMore()
  }

  const label = isPaused
    ? "Waiting for a connection…"
    : isFetchNextPageError
      ? "Try loading older posts again"
      : isFetchingNextPage
        ? "Loading posts…"
        : isAtAutomaticLoadingBarrier
          ? "Keep loading as I scroll"
          : "Load older posts"
  const ActionIcon = isPaused ? WifiOff : isFetchNextPageError ? RotateCcw : History

  const content = (
    <>
      {isFetchingNextPage ? (
        <Spinner aria-hidden="true" data-icon="inline-start" />
      ) : (
        <ActionIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {label}
    </>
  )

  return (
    <div ref={triggerRef} className="mt-10 flex justify-center [overflow-anchor:none]">
      {nextPageHref ? (
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={nextPageHref} aria-label={label} />}
          aria-disabled={isFetching || isPaused}
          onClick={(event) => {
            event.preventDefault()
            if (!isFetching && !isPaused) handleLoadMore()
          }}
        >
          {content}
        </Button>
      ) : (
        <Button variant="outline" disabled={isFetching || isPaused} onClick={handleLoadMore}>
          {content}
        </Button>
      )}
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
