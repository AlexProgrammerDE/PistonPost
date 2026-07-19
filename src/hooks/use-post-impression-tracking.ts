import { useEffect, useRef } from "react"

import type { PostViewSurface } from "@/domain"
import { isMeaningfulPostExposure } from "@/lib/post-impression"
import { trackPostViews } from "@/server/posts"

const EXPOSURE_DURATION_MS = 500
const BATCH_DELAY_MS = 150
const REPEAT_VIEW_INTERVAL_MS = 60_000
const MAX_BATCH_SIZE = 30
const POST_VIEW_SELECTOR = "[data-post-view-id]"
const OBSERVER_THRESHOLDS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]

function submitPostViews(postIds: readonly string[], surface: PostViewSurface) {
  for (let offset = 0; offset < postIds.length; offset += MAX_BATCH_SIZE) {
    const batch = postIds.slice(offset, offset + MAX_BATCH_SIZE)
    void trackPostViews({ data: { postIds: batch, surface } }).catch(() => undefined)
  }
}

export function usePostImpressionTracking({
  postIdentity,
  surface,
}: {
  readonly postIdentity: string
  readonly surface: PostViewSurface
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastViewedAtBySurfaceRef = useRef(new Map<PostViewSurface, Map<string, number>>())

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === "undefined") return undefined

    const lastViewedAt = lastViewedAtBySurfaceRef.current.get(surface) ?? new Map<string, number>()
    lastViewedAtBySurfaceRef.current.set(surface, lastViewedAt)

    const pendingPostIds = new Set<string>()
    const exposureTimers = new Map<Element, ReturnType<typeof setTimeout>>()
    let batchTimer: ReturnType<typeof setTimeout> | undefined

    const wasRecentlyViewed = (postId: string) => {
      const previousViewAt = lastViewedAt.get(postId)
      return previousViewAt !== undefined && Date.now() - previousViewAt < REPEAT_VIEW_INTERVAL_MS
    }

    const flush = () => {
      batchTimer = undefined
      if (pendingPostIds.size === 0) return

      const postIds = Array.from(pendingPostIds)
      pendingPostIds.clear()
      submitPostViews(postIds, surface)
    }

    const queue = (target: Element, postId: string) => {
      exposureTimers.delete(target)
      if (document.visibilityState !== "visible" || wasRecentlyViewed(postId)) return

      lastViewedAt.set(postId, Date.now())
      pendingPostIds.add(postId)
      batchTimer ??= setTimeout(flush, BATCH_DELAY_MS)
    }

    const cancelExposure = (target: Element) => {
      const timer = exposureTimers.get(target)
      if (timer === undefined) return

      clearTimeout(timer)
      exposureTimers.delete(target)
    }

    const cancelAllExposures = () => {
      for (const timer of exposureTimers.values()) clearTimeout(timer)
      exposureTimers.clear()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target
          const postId = target instanceof HTMLElement ? target.dataset.postViewId : undefined
          if (!postId) {
            observer.unobserve(target)
            continue
          }
          if (wasRecentlyViewed(postId)) continue
          if (document.visibilityState !== "visible") {
            cancelExposure(target)
            continue
          }

          const isMeaningful = isMeaningfulPostExposure({
            intersectionHeight: entry.intersectionRect.height,
            isIntersecting: entry.isIntersecting,
            targetHeight: entry.boundingClientRect.height,
          })
          if (!isMeaningful) {
            cancelExposure(target)
            continue
          }
          if (exposureTimers.has(target)) continue

          exposureTimers.set(
            target,
            setTimeout(() => queue(target, postId), EXPOSURE_DURATION_MS),
          )
        }
      },
      { threshold: OBSERVER_THRESHOLDS },
    )

    const observePostTargets = () => {
      for (const target of root.querySelectorAll<HTMLElement>(POST_VIEW_SELECTOR)) {
        const postId = target.dataset.postViewId
        if (postId) observer.observe(target)
      }
    }

    const handleVisibilityChange = () => {
      cancelAllExposures()
      observer.disconnect()
      if (document.visibilityState === "visible") observePostTargets()
    }

    if (document.visibilityState === "visible") observePostTargets()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      observer.disconnect()
      cancelAllExposures()
      if (batchTimer !== undefined) clearTimeout(batchTimer)
      flush()
    }
  }, [postIdentity, surface])

  return rootRef
}
