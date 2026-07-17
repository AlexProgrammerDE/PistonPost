import type { PublicPostRead } from "@/db/public-read-model"

import { markdownToPlainText } from "./markdown"
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
  const tags = post.tags.map((tag) => `#${tag.name}`).join(" ")
  const suffix = tags ? ` · ${tags}` : ""
  if (post.type === "images") {
    const count = post.media.filter((media) => media.kind === "image").length
    return truncateDescription(
      `${post.title} · ${count.toString()} image${count === 1 ? "" : "s"} by ${post.author.name}${suffix}`,
    )
  }
  if (post.type === "video") {
    return truncateDescription(`${post.title} · Video by ${post.author.name}${suffix}`)
  }
  const text = post.textContent ? markdownToPlainText(post.textContent) : null
  const content = text ? ` · ${text}` : ""
  return truncateDescription(`${post.title} · Post by ${post.author.name}${suffix}${content}`)
}

export function millisecondsToIsoDuration(duration: number | null) {
  if (!duration || duration <= 0 || !Number.isFinite(duration)) return undefined
  const seconds = duration / 1_000
  const value = Number.isInteger(seconds)
    ? seconds.toString()
    : seconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
  return `PT${value}S`
}

function postImages(post: PublicPostRead): ReadonlyArray<SeoImage> {
  return post.media
    .filter((media) => media.kind === "image")
    .map((image) => ({
      url: `/media/image/${image.id}/og`,
      alt: image.altText ?? post.title,
      type: "image/jpeg",
      width: 1200,
      height: 630,
    }))
}

function structuredPostImages(post: PublicPostRead): ReadonlyArray<JsonLdObject> {
  return post.media
    .filter((media) => media.kind === "image")
    .map((image) => {
      const url = absoluteUrl(`/media/image/${image.id}/detail`)
      return {
        "@type": "ImageObject",
        url,
        contentUrl: url,
        caption: image.altText ?? post.title,
        width: image.width ?? undefined,
        height: image.height ?? undefined,
      }
    })
}

function selectedPostImage(
  images: ReadonlyArray<SeoImage>,
  selectedImageIndex: number,
): SeoImage | undefined {
  if (images.length === 0) return undefined
  const index = Math.min(Math.max(selectedImageIndex, 0), images.length - 1)
  return images[index]
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
    duration: millisecondsToIsoDuration(media.duration),
  }
}

function postInteractionStatistics(post: PublicPostRead): ReadonlyArray<JsonLdObject> {
  return [
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/ViewAction",
      userInteractionCount: post.viewCount,
    },
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: post.reactions.like,
    },
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/DislikeAction",
      userInteractionCount: post.reactions.dislike,
    },
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: post.commentCount,
    },
  ]
}

export function createPostSeoHead(post: PublicPostRead, selectedImageIndex = 0) {
  const path = `/post/${encodeURIComponent(post.id)}`
  const authorUrl = absoluteUrl(`/user/${encodeURIComponent(post.author.normalizedUsername)}`)
  const description = postDescription(post)
  const video = post.type === "video" ? postVideo(post) : undefined
  const galleryImages = post.type === "images" ? postImages(post) : []
  const structuredImages = post.type === "images" ? structuredPostImages(post) : []
  const image =
    post.type === "images" ? selectedPostImage(galleryImages, selectedImageIndex) : video?.image
  const canonical = absoluteUrl(path)
  const publishedAt = post.publishedAt.toISOString()
  const modifiedAt = post.updatedAt > post.publishedAt ? post.updatedAt.toISOString() : undefined
  const jsonLd: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    "@id": canonical,
    mainEntityOfPage: canonical,
    url: canonical,
    headline: post.title,
    description,
    text:
      post.type === "text" && post.textContent ? markdownToPlainText(post.textContent) : undefined,
    datePublished: publishedAt,
    dateModified: modifiedAt,
    author: {
      "@type": "Person",
      "@id": `${authorUrl}#person`,
      name: post.author.name,
      alternateName: `@${post.author.username}`,
      url: authorUrl,
    },
    isPartOf: {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
    },
    keywords: post.tags.map((tag) => tag.name),
    image: structuredImages.length > 0 ? structuredImages : undefined,
    video: video
      ? {
          "@type": "VideoObject",
          name: post.title,
          description,
          uploadDate: post.publishedAt.toISOString(),
          thumbnailUrl: absoluteUrl(video.image.url),
          embedUrl: absoluteUrl(video.player.url),
          contentUrl: absoluteUrl(video.download.url),
          duration: video.duration,
          width: video.download.width,
          height: video.download.height,
        }
      : undefined,
    commentCount: post.commentCount,
    interactionStatistic: postInteractionStatistics(post),
    comment: post.structuredComments?.map((comment) => ({
      "@type": "Comment",
      "@id": `${canonical}#comment-${encodeURIComponent(comment.id)}`,
      text: comment.content,
      dateCreated: comment.createdAt.toISOString(),
      dateModified:
        comment.updatedAt > comment.createdAt ? comment.updatedAt.toISOString() : undefined,
      author: {
        "@type": "Person",
        "@id": `${absoluteUrl(
          `/user/${encodeURIComponent(comment.authorNormalizedUsername)}`,
        )}#person`,
        name: comment.authorName,
        alternateName: `@${comment.authorUsername}`,
        url: absoluteUrl(`/user/${encodeURIComponent(comment.authorNormalizedUsername)}`),
      },
    })),
  }

  return createSeoHead({
    title:
      post.type === "video"
        ? `${post.title} · ${post.author.name} · ${SITE_NAME}`
        : `${post.title} · ${SITE_NAME}`,
    description,
    path,
    type: post.type === "video" ? "video.other" : "article",
    image,
    video: video?.download,
    player: video?.player,
    twitterCard: video ? "player" : image ? "summary_large_image" : "summary",
    indexing: post.visibility === "unlisted" || !post.author.searchIndexable ? "noindex" : "index",
    publishedAt,
    modifiedAt,
    authorUrl,
    tags: post.tags.map((tag) => tag.name),
    jsonLd,
  })
}
