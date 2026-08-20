import { lazy, Suspense, useCallback, useRef, useState } from "react"

import { VIDEO_THUMBNAIL_CACHE_VERSION } from "@/lib/video-thumbnail"

const LazyVidstackVideoPlayer = lazy(() =>
  import("@/components/VidstackVideoPlayer").then(({ VidstackVideoPlayer }) => ({
    default: VidstackVideoPlayer,
  })),
)

function VideoPoster({ detail, mediaId }: { readonly detail: boolean; readonly mediaId: string }) {
  return (
    <img
      src={`/media/video/${mediaId}/thumbnail?v=${VIDEO_THUMBNAIL_CACHE_VERSION.toString()}`}
      alt=""
      aria-hidden="true"
      className="size-full object-contain"
      loading={detail ? "eager" : "lazy"}
      fetchPriority={detail ? "high" : undefined}
    />
  )
}

export function PostVideoPlayer({
  detail,
  duration,
  mediaId,
  title,
}: {
  readonly detail: boolean
  readonly duration: number | null
  readonly mediaId: string
  readonly title: string
}) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const [shouldLoadPlayer, setShouldLoadPlayer] = useState(false)

  const setContainerRef = useCallback(
    (container: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      if (!container || shouldLoadPlayer) return

      if (detail || typeof IntersectionObserver === "undefined") {
        setShouldLoadPlayer(true)
        return
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return
          setShouldLoadPlayer(true)
          observer.disconnect()
          observerRef.current = null
        },
        { rootMargin: "400px 0px" },
      )
      observer.observe(container)
      observerRef.current = observer
    },
    [detail, shouldLoadPlayer],
  )

  const poster = <VideoPoster detail={detail} mediaId={mediaId} />

  return (
    <div ref={setContainerRef} className="size-full">
      {shouldLoadPlayer ? (
        <Suspense fallback={poster}>
          <LazyVidstackVideoPlayer
            detail={detail}
            duration={duration}
            mediaId={mediaId}
            title={title}
          />
        </Suspense>
      ) : (
        poster
      )}
    </div>
  )
}
