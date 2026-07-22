const DAILYMOTION_VIDEO_ID = /^[A-Za-z0-9]+$/u
const TUMBLR_BLOG_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)*$/u
const TUMBLR_POST_ID = /^\d+$/u
const VIMEO_HASH = /^[A-Za-z0-9]+$/u
const VIMEO_VIDEO_ID = /^\d+$/u
const X_POST_ID = /^\d+$/u
const X_USERNAME = /^[A-Za-z0-9_]{1,15}$/u
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
  | {
      readonly provider: "soundcloud"
      readonly url: string
    }
  | {
      readonly provider: "vimeo"
      readonly videoId: string
      readonly hash: string | null
    }
  | {
      readonly provider: "dailymotion"
      readonly videoId: string
    }
  | {
      readonly provider: "x"
      readonly postId: string
      readonly url: string
    }
  | {
      readonly provider: "tumblr"
      readonly postId: string
      readonly url: string
    }

export type MarkdownEmbedProvider = MarkdownEmbed["provider"]

const providerNames = {
  dailymotion: "Dailymotion",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  tumblr: "Tumblr",
  vimeo: "Vimeo",
  x: "X",
  youtube: "YouTube",
} satisfies Record<MarkdownEmbedProvider, string>

export function markdownEmbedProviderName(embed: MarkdownEmbed) {
  return providerNames[embed.provider]
}

function normalizedUrl(url: URL) {
  url.hash = ""
  return url.toString()
}

function parseYouTube(url: URL): MarkdownEmbed | null {
  const hostname = url.hostname.toLocaleLowerCase("en-US")
  let videoId: string | null = null
  if (hostname === "youtu.be") {
    videoId = url.pathname.split("/").find(Boolean) ?? null
  } else if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "music.youtube.com"
  ) {
    const segments = url.pathname.split("/").filter(Boolean)
    videoId =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : ["embed", "live", "shorts"].includes(segments[0] ?? "")
          ? (segments[1] ?? null)
          : null
  }
  return videoId && YOUTUBE_VIDEO_ID.test(videoId) ? { provider: "youtube", videoId } : null
}

function parseSpotify(url: URL): MarkdownEmbed | null {
  if (url.hostname.toLocaleLowerCase("en-US") !== "open.spotify.com") return null
  const segments = url.pathname.split("/").filter(Boolean)
  const firstEntitySegment = segments[0]?.startsWith("intl-") ? 1 : 0
  const entityType = SPOTIFY_ENTITY_TYPES.find(
    (candidate) => candidate === segments[firstEntitySegment],
  )
  const entityId = segments[firstEntitySegment + 1]
  return entityType && entityId && SPOTIFY_ENTITY_ID.test(entityId)
    ? { provider: "spotify", entityType, entityId }
    : null
}

function parseSoundCloud(url: URL): MarkdownEmbed | null {
  const hostname = url.hostname.toLocaleLowerCase("en-US")
  if (hostname !== "soundcloud.com" && hostname !== "www.soundcloud.com") return null
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2 || segments.some((segment) => segment.length > 200)) return null
  return { provider: "soundcloud", url: normalizedUrl(url) }
}

function parseVimeo(url: URL): MarkdownEmbed | null {
  const hostname = url.hostname.toLocaleLowerCase("en-US")
  const segments = url.pathname.split("/").filter(Boolean)
  const playerUrl = hostname === "player.vimeo.com" && segments[0] === "video"
  const videoId = playerUrl ? segments[1] : segments[0]
  if (
    (hostname !== "vimeo.com" && hostname !== "www.vimeo.com" && !playerUrl) ||
    !videoId ||
    !VIMEO_VIDEO_ID.test(videoId)
  ) {
    return null
  }
  const candidateHash = playerUrl ? url.searchParams.get("h") : segments[1]
  const hash = candidateHash && VIMEO_HASH.test(candidateHash) ? candidateHash : null
  if (candidateHash && !hash) return null
  return { provider: "vimeo", videoId, hash }
}

function parseDailymotion(url: URL): MarkdownEmbed | null {
  const hostname = url.hostname.toLocaleLowerCase("en-US")
  const segments = url.pathname.split("/").filter(Boolean)
  const candidate =
    hostname === "dai.ly"
      ? segments[0]
      : hostname === "dailymotion.com" || hostname === "www.dailymotion.com"
        ? segments[0] === "video"
          ? segments[1]
          : null
        : null
  const videoId = candidate?.split("_", 1)[0]
  return videoId && DAILYMOTION_VIDEO_ID.test(videoId) ? { provider: "dailymotion", videoId } : null
}

function parseX(url: URL): MarkdownEmbed | null {
  const hostname = url.hostname.toLocaleLowerCase("en-US")
  if (
    hostname !== "x.com" &&
    hostname !== "www.x.com" &&
    hostname !== "twitter.com" &&
    hostname !== "www.twitter.com" &&
    hostname !== "mobile.twitter.com"
  ) {
    return null
  }
  const segments = url.pathname.split("/").filter(Boolean)
  const username = segments[0]
  const postId = segments[1] === "status" ? segments[2] : null
  if (!username || !X_USERNAME.test(username) || !postId || !X_POST_ID.test(postId)) return null
  return {
    provider: "x",
    postId,
    url: `https://x.com/${username}/status/${postId}`,
  }
}

function parseTumblr(url: URL): MarkdownEmbed | null {
  const hostname = url.hostname.toLocaleLowerCase("en-US")
  const segments = url.pathname.split("/").filter(Boolean)
  const modernHost = hostname === "tumblr.com" || hostname === "www.tumblr.com"
  const legacyHost = hostname.endsWith(".tumblr.com") && !modernHost
  const blogName = modernHost
    ? segments[0]
    : legacyHost
      ? hostname.slice(0, -".tumblr.com".length)
      : null
  const postId = modernHost ? segments[1] : segments[0] === "post" ? segments[1] : null
  if (!blogName || !TUMBLR_BLOG_NAME.test(blogName) || !postId || !TUMBLR_POST_ID.test(postId)) {
    return null
  }
  return {
    provider: "tumblr",
    postId,
    url: normalizedUrl(url),
  }
}

export function parseMarkdownEmbed(value: string): MarkdownEmbed | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null

  return (
    parseYouTube(url) ??
    parseSpotify(url) ??
    parseSoundCloud(url) ??
    parseVimeo(url) ??
    parseDailymotion(url) ??
    parseX(url) ??
    parseTumblr(url)
  )
}
