import { lazy, Suspense, useEffect, useRef, useState } from "react"

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
  mediaId,
  title,
}: {
  readonly detail: boolean
  readonly mediaId: string
  readonly title: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoadPlayer, setShouldLoadPlayer] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    if (detail || typeof IntersectionObserver === "undefined") {
      setShouldLoadPlayer(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setShouldLoadPlayer(true)
        observer.disconnect()
      },
      { rootMargin: "400px 0px" },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [detail])

  const poster = <VideoPoster detail={detail} mediaId={mediaId} />

  return (
    <div ref={containerRef} className="size-full">
      {shouldLoadPlayer ? (
        <Suspense fallback={poster}>
          <LazyVidstackVideoPlayer detail={detail} mediaId={mediaId} title={title} />
        </Suspense>
      ) : (
        poster
      )}
    </div>
  )
}
