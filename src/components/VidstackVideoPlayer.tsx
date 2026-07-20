// oxlint-disable-next-line import/no-unassigned-import -- Vidstack's default layout is styled by its published CSS.
import "@vidstack/react/player/styles/default/theme.css"
// oxlint-disable-next-line import/no-unassigned-import -- Vidstack's default video controls require this stylesheet.
import "@vidstack/react/player/styles/default/layouts/video.css"
import {
  isDASHProvider,
  MediaPlayer,
  MediaProvider,
  Poster,
  type MediaProviderAdapter,
} from "@vidstack/react"
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default"

import { VIDEO_THUMBNAIL_CACHE_VERSION } from "@/lib/video-thumbnail"

function configureProvider(provider: MediaProviderAdapter | null) {
  if (isDASHProvider(provider)) provider.library = () => import("dashjs")
}

export function VidstackVideoPlayer({
  detail,
  mediaId,
  title,
}: {
  readonly detail: boolean
  readonly mediaId: string
  readonly title: string
}) {
  const manifestPath = `/media/video/${mediaId}/manifest`
  const manifestUrl =
    typeof window === "undefined" ? manifestPath : new URL(manifestPath, window.location.href).href
  const poster = `/media/video/${mediaId}/thumbnail?v=${VIDEO_THUMBNAIL_CACHE_VERSION.toString()}`

  return (
    <MediaPlayer
      src={{ src: manifestUrl, type: "application/dash+xml" }}
      title={title}
      poster={poster}
      viewType="video"
      streamType="on-demand"
      load={detail ? "eager" : "visible"}
      posterLoad={detail ? "eager" : "visible"}
      preload={detail ? "metadata" : "none"}
      playsInline
      crossOrigin="anonymous"
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
        <Poster className="vds-poster object-contain" alt="" />
      </MediaProvider>
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  )
}
