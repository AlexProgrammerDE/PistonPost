import type { PublicPostRead } from "@pistonpost/db/public-read-model"

import {
  SITE_NAME,
  absoluteUrl,
  createSeoHead,
  truncateDescription,
  type JsonLdObject,
  type SeoImage,
  type SeoVideo,
} from "./seo"

function postDescription(post: PublicPostRead) {
  if (post.textContent) return truncateDescription(post.textContent)

  const tags = post.tags.map((tag) => `#${tag.name}`).join(" ")
  const suffix = tags ? ` · ${tags}` : ""
  if (post.type === "images") {
    const count = post.media.filter((media) => media.kind === "image").length
    return truncateDescription(
      `Post by ${post.author.name} · ${count.toString()} image${count === 1 ? "" : "s"}${suffix}`,
    )
  }
  if (post.type === "video") {
    return truncateDescription(`Video by ${post.author.name}${suffix}`)
  }
  return truncateDescription(`Post by ${post.author.name}${suffix}`)
}

function selectedPostImage(post: PublicPostRead, selectedImageIndex: number): SeoImage | undefined {
  const images = post.media.filter((media) => media.kind === "image")
  if (images.length === 0) return undefined
  const index = Math.min(Math.max(selectedImageIndex, 0), images.length - 1)
  const image = images[index]
  if (!image) return undefined
  return {
    url: `/media/image/${image.id}/og`,
    alt: image.altText ?? post.title,
    type: "image/webp",
    width: 1200,
    height: 630,
  }
}

function postVideo(post: PublicPostRead) {
  const media = post.media.find((entry) => entry.kind === "video")
  if (!media) return undefined
  const width = media.width ?? 1280
  const height = media.height ?? 720
  return {
    image: {
      url: `/media/video/${media.id}/thumbnail`,
      alt: `Video thumbnail for ${post.title}`,
      type: "image/jpeg",
      width: 1200,
      height: 630,
    } satisfies SeoImage,
    player: {
      url: `/media/video/${media.id}/player`,
      type: "text/html",
      width,
      height,
    } satisfies SeoVideo,
    download: {
      url: `/media/video/${media.id}/download`,
      type: "video/mp4",
      width,
      height,
    } satisfies SeoVideo,
  }
}

export function createPostSeoHead(post: PublicPostRead, selectedImageIndex = 0) {
  const path = `/post/${encodeURIComponent(post.id)}`
  const authorUrl = absoluteUrl(`/user/${encodeURIComponent(post.author.username)}`)
  const description = postDescription(post)
  const video = post.type === "video" ? postVideo(post) : undefined
  const image = post.type === "images" ? selectedPostImage(post, selectedImageIndex) : video?.image
  const canonical = absoluteUrl(path)
  const jsonLd: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    "@id": canonical,
    url: canonical,
    headline: post.title,
    description,
    articleBody: post.textContent ?? undefined,
    datePublished: post.publishedAt.toISOString(),
    author: {
      "@type": "Person",
      name: post.author.name,
      url: authorUrl,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteUrl("/"),
    },
    keywords: post.tags.map((tag) => tag.name),
    image: image ? absoluteUrl(image.url) : undefined,
    video: video
      ? {
          "@type": "VideoObject",
          name: post.title,
          description,
          uploadDate: post.publishedAt.toISOString(),
          thumbnailUrl: absoluteUrl(video.image.url),
          embedUrl: absoluteUrl(video.player.url),
          contentUrl: absoluteUrl(video.download.url),
          width: video.download.width,
          height: video.download.height,
        }
      : undefined,
  }

  return createSeoHead({
    title: `${post.title} · ${SITE_NAME}`,
    description,
    path,
    type: post.type === "video" ? "video.other" : "article",
    image,
    video: video?.download,
    player: video?.player,
    twitterCard: video ? "player" : image ? "summary_large_image" : "summary",
    noIndex: post.visibility === "unlisted",
    publishedAt: post.publishedAt.toISOString(),
    authorUrl,
    jsonLd,
  })
}
