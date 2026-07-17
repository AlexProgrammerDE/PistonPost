const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u
const SPOTIFY_ENTITY_ID = /^[A-Za-z0-9]{22}$/u
const SPOTIFY_ENTITY_TYPES = ["album", "artist", "episode", "playlist", "show", "track"] as const
const BLOCKED_IMAGE_HOSTNAMES = ["home.arpa", "internal", "local", "localhost"]
const IPV4_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$/u

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

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

export function parseMarkdownEmbed(value: string): MarkdownEmbed | null {
  const url = parseHttpUrl(value)
  if (!url || url.protocol !== "https:") return null

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

export function isProxyableExternalImageUrl(value: string) {
  const url = parseHttpUrl(value)
  if (!url || url.protocol !== "https:" || url.username || url.password) return false
  if (url.port && url.port !== "443") return false

  const hostname = url.hostname.toLocaleLowerCase("en-US").replace(/\.$/u, "")
  if (!hostname || IPV4_HOST.test(hostname) || hostname.includes(":")) {
    return false
  }
  return !BLOCKED_IMAGE_HOSTNAMES.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  )
}

export function externalImageProxyUrl(postId: string, sourceUrl: string) {
  const search = new URLSearchParams({ source: sourceUrl })
  return `/media/external-image/${encodeURIComponent(postId)}?${search.toString()}`
}

export function markdownContainsImageUrl(markdown: string, sourceUrl: string) {
  const escaped = sourceUrl.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  return new RegExp(`!\\[[^\\]]*\\]\\(\\s*<?${escaped}(?:>|\\s|\\))`, "u").test(markdown)
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replaceAll(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replaceAll(/^\s{0,3}(?:>|[-+*]|\d+[.)])\s+/gmu, "")
    .replaceAll(/^\s{0,3}\[[ xX]\]\s+/gmu, "")
    .replaceAll(/[*_~`|]/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
}
