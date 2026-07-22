const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u
const SPOTIFY_ENTITY_ID = /^[A-Za-z0-9]{22}$/u
const SPOTIFY_ENTITY_TYPES = ["album", "artist", "episode", "playlist", "show", "track"] as const

type SpotifyEntityType = (typeof SPOTIFY_ENTITY_TYPES)[number]

export type MarkdownEmbed =
  | {
      readonly provider: "youtube"
      readonly videoId: string
    }
  | {
      readonly provider: "spotify"
      readonly entityType: SpotifyEntityType
      readonly entityId: string
    }

export function parseMarkdownEmbed(value: string): MarkdownEmbed | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null

  const hostname = url.hostname.toLocaleLowerCase("en-US")
  let youtubeVideoId: string | null = null
  if (hostname === "youtu.be") {
    youtubeVideoId = url.pathname.split("/").find(Boolean) ?? null
  } else if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "music.youtube.com"
  ) {
    const segments = url.pathname.split("/").filter(Boolean)
    youtubeVideoId =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : ["embed", "live", "shorts"].includes(segments[0] ?? "")
          ? (segments[1] ?? null)
          : null
  }
  if (youtubeVideoId && YOUTUBE_VIDEO_ID.test(youtubeVideoId)) {
    return { provider: "youtube", videoId: youtubeVideoId }
  }

  if (hostname !== "open.spotify.com") return null
  const segments = url.pathname.split("/").filter(Boolean)
  const firstEntitySegment = segments[0]?.startsWith("intl-") ? 1 : 0
  const entityType = SPOTIFY_ENTITY_TYPES.find(
    (candidate) => candidate === segments[firstEntitySegment],
  )
  const entityId = segments[firstEntitySegment + 1]
  if (!entityType || !entityId || !SPOTIFY_ENTITY_ID.test(entityId)) {
    return null
  }
  return { provider: "spotify", entityType, entityId }
}
