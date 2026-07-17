import type { ComponentProps } from "react"

export const SITE_NAME = "PistonPost"
export const SITE_URL = "https://post.pistonmaster.net"
export const SITE_DESCRIPTION =
  "Posts, pictures, videos, and whatever else is worth passing around."
export const SITE_TWITTER_HANDLE = "@AlexProgrammer3"
export const SOCIAL_IMAGE_WIDTH = 1200
export const SOCIAL_IMAGE_HEIGHT = 630

type JsonLdPrimitive = string | number | boolean | null
type JsonLdValue = JsonLdPrimitive | JsonLdObject | ReadonlyArray<JsonLdValue>
export type JsonLdObject = { readonly [key: string]: JsonLdValue | undefined }

export type SeoImage = {
  readonly url: string
  readonly alt: string
  readonly type?: string
  readonly width?: number
  readonly height?: number
}

export type SeoVideo = {
  readonly url: string
  readonly type: string
  readonly width: number
  readonly height: number
}

type SeoOptions = {
  readonly title: string
  readonly description: string
  readonly path: string
  readonly type?: "website" | "article" | "profile" | "video.other"
  readonly image?: SeoImage
  readonly video?: SeoVideo
  readonly player?: SeoVideo
  readonly twitterCard: "summary" | "summary_large_image" | "player"
  readonly indexing?: "index" | "noindex" | "inherit"
  readonly publishedAt?: string
  readonly modifiedAt?: string
  readonly authorUrl?: string
  readonly tags?: ReadonlyArray<string>
  readonly profileUsername?: string
  readonly twitterCreator?: string
  readonly jsonLd?: JsonLdObject
}

const defaultImage: SeoImage = {
  url: "/og-default.png",
  alt: "PistonPost",
  type: "image/png",
  width: SOCIAL_IMAGE_WIDTH,
  height: SOCIAL_IMAGE_HEIGHT,
}

export function absoluteUrl(path: string) {
  return new URL(path, `${SITE_URL}/`).toString()
}

export function truncateDescription(value: string, maximumLength = 160) {
  const normalized = value.replaceAll(/\s+/g, " ").trim()
  if (normalized.length <= maximumLength) return normalized
  return `${normalized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`
}

export function createSeoHead(options: SeoOptions) {
  const canonical = absoluteUrl(options.path)
  const image = options.image ?? defaultImage
  const imageUrl = absoluteUrl(image.url)
  const imageMeta: Array<ComponentProps<"meta">> = [
    { property: "og:image", content: imageUrl },
    { property: "og:image:secure_url", content: imageUrl },
  ]
  if (image.type) imageMeta.push({ property: "og:image:type", content: image.type })
  if (image.width) {
    imageMeta.push({ property: "og:image:width", content: image.width.toString() })
  }
  if (image.height) {
    imageMeta.push({ property: "og:image:height", content: image.height.toString() })
  }
  imageMeta.push({ property: "og:image:alt", content: image.alt })

  const meta: Array<ComponentProps<"meta">> = [
    { title: options.title },
    { name: "description", content: options.description },
    { property: "og:title", content: options.title },
    { property: "og:description", content: options.description },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_US" },
    { property: "og:type", content: options.type ?? "website" },
    { property: "og:url", content: canonical },
    ...imageMeta,
    { name: "twitter:card", content: options.twitterCard },
    { name: "twitter:site", content: SITE_TWITTER_HANDLE },
    { name: "twitter:title", content: options.title },
    { name: "twitter:description", content: options.description },
    { name: "twitter:url", content: canonical },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: image.alt },
  ]

  if (options.twitterCreator) {
    meta.push({ name: "twitter:creator", content: options.twitterCreator })
  }

  if (options.publishedAt) {
    meta.push({ property: "article:published_time", content: options.publishedAt })
  }
  if (options.modifiedAt) {
    meta.push({ property: "article:modified_time", content: options.modifiedAt })
  }
  if (options.authorUrl) meta.push({ property: "article:author", content: options.authorUrl })
  for (const tag of options.tags ?? []) {
    meta.push({ property: "article:tag", content: tag })
  }
  if (options.profileUsername) {
    meta.push({ property: "profile:username", content: options.profileUsername })
  }
  if (options.video) {
    const videoUrl = absoluteUrl(options.video.url)
    meta.push(
      { property: "og:video", content: videoUrl },
      { property: "og:video:secure_url", content: videoUrl },
      { property: "og:video:type", content: options.video.type },
      { property: "og:video:width", content: options.video.width.toString() },
      { property: "og:video:height", content: options.video.height.toString() },
    )
  }
  if (options.player) {
    const playerUrl = absoluteUrl(options.player.url)
    meta.push(
      { name: "twitter:player", content: playerUrl },
      { name: "twitter:player:width", content: options.player.width.toString() },
      { name: "twitter:player:height", content: options.player.height.toString() },
    )
  }
  const indexing = options.indexing ?? "index"
  if (indexing === "index") {
    meta.push({
      name: "robots",
      content: "index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1",
    })
  } else if (indexing === "noindex") {
    meta.push({ name: "robots", content: "noindex, nofollow" })
  }

  return {
    meta,
    links: [{ rel: "canonical", href: canonical }],
    scripts: options.jsonLd
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify(options.jsonLd)
              .replaceAll("<", "\\u003c")
              .replaceAll("\u2028", "\\u2028")
              .replaceAll("\u2029", "\\u2029"),
          },
        ]
      : [],
  }
}
