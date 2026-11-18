// oxlint-disable-next-line import/no-unassigned-import -- Vidstack's default layout is styled by its published CSS.
import "@vidstack/react/player/styles/default/theme.css"
// oxlint-disable-next-line import/no-unassigned-import -- Vidstack's default video controls require this stylesheet.
import "@vidstack/react/player/styles/default/layouts/video.css"
import {
  canPlayHLSNatively,
  isDASHProvider,
  MediaPlayer,
  MediaProvider,
  Poster,
  type MediaProviderAdapter,
} from "@vidstack/react"
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default"

import { createVideoPreviewThumbnails, VIDEO_THUMBNAIL_CACHE_VERSION } from "@/lib/video-thumbnail"

function configureProvider(provider: MediaProviderAdapter | null) {
  if (!isDASHProvider(provider)) return
  provider.library = () => import("dashjs")
  // Pick a rendition that fits the player instead of the largest one, so a phone does not fetch
  // 1080p segments for a 360px wide player.
  provider.config = {
    streaming: { abr: { limitBitrateByPortal: true, usePixelRatioInLimitBitrateByPortal: true } },
  }
}

function canUseNativeHLSAirPlay() {
  return (
    canPlayHLSNatively() &&
    typeof window !== "undefined" &&
    "WebKitPlaybackTargetAvailabilityEvent" in window
  )
}

export function VidstackVideoPlayer({
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
  const useNativeHLS = canUseNativeHLSAirPlay()
  const format = useNativeHLS ? "hls" : "dash"
  const manifestPath = `/media/video/${mediaId}/manifest?format=${format}`
  const manifestUrl =
    typeof window === "undefined" ? manifestPath : new URL(manifestPath, window.location.href).href
  const posterPath = `/media/video/${mediaId}/thumbnail?v=${VIDEO_THUMBNAIL_CACHE_VERSION.toString()}`
  const poster =
    typeof window === "undefined" ? posterPath : new URL(posterPath, window.location.href).href
  const downloadPath = `/media/video/${mediaId}/download`
  const downloadUrl =
    typeof window === "undefined" ? downloadPath : new URL(downloadPath, window.location.href).href
  const durationSeconds =
    duration !== null && Number.isFinite(duration) && duration > 0 ? duration / 1_000 : undefined
  const previewThumbnails = createVideoPreviewThumbnails({
    mediaId,
    durationMilliseconds: duration,
  })

  return (
    // oxlint-disable-next-line typescript/no-deprecated -- Vidstack is deprecated in favor of Video.js 10, which is a separate migration.
    <MediaPlayer
      src={{
        src: manifestUrl,
        type: useNativeHLS ? "application/x-mpegurl" : "application/dash+xml",
      }}
      title={title}
      poster={poster}
      duration={durationSeconds}
      viewType="video"
      streamType="on-demand"
      // Wait for Play before fetching video. The poster still loads right away, and dash.js ignores
      // preload, so an eager load would buffer several megabytes nobody asked for.
      load="play"
      posterLoad={detail ? "eager" : "visible"}
      preload={detail ? "metadata" : "none"}
      playsInline
      preferNativeHLS={useNativeHLS}
      storage="pistonpost-video"
      onProviderChange={configureProvider}
      className="size-full"
      style={{
        "--video-brand": "var(--primary)",
        "--video-border": "none",
        "--video-border-radius": "0px",
        "--video-focus-ring-color": "var(--ring)",
        "--video-font-family": "var(--font-sans)",
      }}
    >
      <MediaProvider>
        <Poster className="vds-poster object-contain" alt="" crossOrigin={null} />
      </MediaProvider>
      <DefaultVideoLayout
        icons={defaultLayoutIcons}
        colorScheme="dark"
        download={{ url: downloadUrl, filename: `${title}.mp4` }}
        thumbnails={previewThumbnails}
      />
    </MediaPlayer>
  )
}
