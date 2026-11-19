import type { PublicPostRead } from "@/db/public-read-model"

import { commentMarkdownToPlainText, postMarkdownToPlainText } from "./markdown"
import { fitMediaDimensions, mediaImageUrl, SOCIAL_MEDIA_IMAGE_MAX_SIZE } from "./media-image"
import {
  SITE_NAME,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  absoluteUrl,
  createSeoHead,
  truncateDescription,
  truncateTitle,
  type JsonLdObject,
  type SeoImage,
  type SeoVideo,
} from "./seo"
import { heartCountLabel } from "./social-state"
import {
  normalizeStreamThumbnailDimensions,
  SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE,
  VIDEO_PLAYER_CACHE_VERSION,
  VIDEO_THUMBNAIL_CACHE_VERSION,
} from "./video-thumbnail"

function postDescription(post: PublicPostRead, authorName: string) {
  const tags = post.tags.map((tag) => `#${tag.name}`).join(" ")
  const suffix = tags ? ` · ${tags}` : ""
  if (post.type === "images") {
    const count = post.media.filter((media) => media.kind === "image").length
    return truncateDescription(
      `${count.toString()} image${count === 1 ? "" : "s"} by ${authorName}${suffix}`,
    )
  }
  if (post.type === "video") {
    const duration = formatCompactDuration(
      post.media.find((media) => media.kind === "video")?.duration ?? null,
    )
    return truncateDescription(`Video by ${authorName}${duration ? ` · ${duration}` : ""}${suffix}`)
  }
  const text = post.textContent ? postMarkdownToPlainText(post.textContent) : null
  const content = text ? ` · ${text}` : ""
  return truncateDescription(`By ${authorName}${content}${suffix}`)
}

function formatCompactDuration(duration: number | null) {
  if (!duration || duration <= 0 || !Number.isFinite(duration)) return
  const totalSeconds = Math.max(1, Math.round(duration / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours.toString()}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`
}

export function millisecondsToIsoDuration(duration: number | null) {
  if (!duration || duration <= 0 || !Number.isFinite(duration)) return
  const seconds = duration / 1000
  const value = Number.isInteger(seconds)
    ? seconds.toString()
    : seconds.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "")
  return `PT${value}S`
}

function postImages(post: PublicPostRead, postTitle: string): readonly SeoImage[] {
  return post.media
    .filter((media) => media.kind === "image")
    .map((image) => {
      const dimensions = fitMediaDimensions(
        image,
        SOCIAL_MEDIA_IMAGE_MAX_SIZE,
        SOCIAL_MEDIA_IMAGE_MAX_SIZE,
      )
      return {
        url: mediaImageUrl(image.id, "og"),
        alt: image.altText ?? postTitle,
        type: "image/jpeg",
        width: dimensions?.width,
        height: dimensions?.height,
      }
    })
}

// The feed variant scales images down to fit 1280 x 1280. Sitemaps list the same variant.
const STRUCTURED_IMAGE_MAX_SIZE = 1280

function structuredPostImages(post: PublicPostRead, postTitle: string): readonly JsonLdObject[] {
  return post.media
    .filter((media) => media.kind === "image")
    .map((image) => {
      const url = absoluteUrl(mediaImageUrl(image.id, "feed"))
      const dimensions = fitMediaDimensions(
        image,
        STRUCTURED_IMAGE_MAX_SIZE,
        STRUCTURED_IMAGE_MAX_SIZE,
      )
      return {
        "@type": "ImageObject",
        url,
        contentUrl: url,
        caption: image.altText ?? postTitle,
        width: dimensions?.width,
        height: dimensions?.height,
      }
    })
}

function postVideo(post: PublicPostRead, postTitle: string) {
  const media = post.media.find((entry) => entry.kind === "video")
  if (!media) return
  const width = media.width ?? 1280
  const height = media.height ?? 720
  const fittedThumbnailDimensions = fitMediaDimensions(
    media,
    SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE,
    SOCIAL_VIDEO_THUMBNAIL_MAX_SIZE,
  )
  const thumbnailDimensions = fittedThumbnailDimensions
    ? normalizeStreamThumbnailDimensions(fittedThumbnailDimensions)
    : undefined
  return {
    image: {
      url: `/media/video/${media.id}/thumbnail?v=${VIDEO_THUMBNAIL_CACHE_VERSION.toString()}`,
      alt: `Video thumbnail for ${postTitle}`,
      type: "image/jpeg",
      width: thumbnailDimensions?.width,
      height: thumbnailDimensions?.height,
    } satisfies SeoImage,
    player: {
      url: `/media/video/${media.id}/player?v=${VIDEO_PLAYER_CACHE_VERSION.toString()}`,
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
    durationSeconds:
      media.duration && media.duration > 0 && Number.isFinite(media.duration)
        ? Math.max(1, Math.round(media.duration / 1000))
        : undefined,
  }
}

// FNV-1a keeps the card version short and stable without async hashing.
function shortHash(value: string) {
  let hash = 0x81_1c_9d_c5
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01_00_01_93)
  }
  return (hash >>> 0).toString(36)
}

/**
 * The card shows the author's name and username, which can change without
 * touching the post. Both are part of the version so a rename gets a new URL.
 */
export function textPostCardUrl(post: Pick<PublicPostRead, "id" | "updatedAt" | "author">) {
  const authorVersion = shortHash(`${post.author.name}\n${post.author.username}`)
  const version = `${post.updatedAt.getTime().toString()}-${authorVersion}`
  return `/media/post/${encodeURIComponent(post.id)}/card?v=${version}`
}

function textPostImage(post: PublicPostRead, postTitle: string, authorName: string): SeoImage {
  return {
    url: textPostCardUrl(post),
    alt: truncateDescription(`${postTitle} by ${authorName}`),
    type: "image/png",
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
  }
}

function postInteractionStatistics(post: PublicPostRead): readonly JsonLdObject[] {
  return [
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/ViewAction",
      userInteractionCount: post.viewCount,
    },
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: post.heartCount,
    },
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: post.commentCount,
    },
  ]
}

export function createPostSeoHead(post: PublicPostRead, selectedImageIndex?: number) {
  const path = `/post/${encodeURIComponent(post.id)}`
  const authorUrl = absoluteUrl(`/user/${encodeURIComponent(post.author.normalizedUsername)}`)
  const postTitle = truncateTitle(post.title, 64)
  const authorName = truncateTitle(post.author.name, 24)
  const description = postDescription(post, authorName)
  const video = post.type === "video" ? postVideo(post, postTitle) : undefined
  const galleryImages = post.type === "images" ? postImages(post, postTitle) : []
  const hasSelectedImage = post.type === "images" && selectedImageIndex !== undefined
  const requestedImageIndex = selectedImageIndex ?? 0
  const imageIndex = Math.min(
    Math.max(Number.isFinite(requestedImageIndex) ? Math.trunc(requestedImageIndex) : 0, 0),
    Math.max(0, galleryImages.length - 1),
  )
  const structuredImages = post.type === "images" ? structuredPostImages(post, postTitle) : []
  const image =
    post.type === "images"
      ? galleryImages[imageIndex]
      : post.type === "text"
        ? textPostImage(post, postTitle, authorName)
        : video?.image
  const canonical = absoluteUrl(path)
  const publishedAt = post.publishedAt.toISOString()
  const modifiedAt = post.updatedAt > post.publishedAt ? post.updatedAt.toISOString() : undefined
  const jsonLd: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    "@id": canonical,
    mainEntityOfPage: canonical,
    url: canonical,
    headline: postTitle,
    description,
    text:
      post.type === "text" && post.textContent
        ? postMarkdownToPlainText(post.textContent)
        : undefined,
    datePublished: publishedAt,
    dateModified: modifiedAt,
    author: {
      "@type": "Person",
      "@id": `${authorUrl}#person`,
      name: authorName,
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
          name: postTitle,
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
      text: commentMarkdownToPlainText(comment.content),
      datePublished: comment.createdAt.toISOString(),
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
    discord:
      post.visibility === "public"
        ? {
            title: post.title,
            description: hasSelectedImage
              ? `@${post.author.username} · Image ${imageIndex + 1} of ${galleryImages.length}`
              : `${authorName} (@${post.author.username})\n${post.type === "text" && post.textContent ? postMarkdownToPlainText(post.textContent) : description}\n${heartCountLabel(post.heartCount)} · ${post.commentCount === 1 ? "1 comment" : `${post.commentCount} comments`}`,
            url: hasSelectedImage ? `${canonical}?image=${imageIndex}` : canonical,
            layout: hasSelectedImage ? (imageIndex > 0 ? "media" : "compact") : "default",
            label: "View post",
            images:
              post.type === "images"
                ? (hasSelectedImage
                    ? galleryImages.slice(imageIndex, imageIndex + 1)
                    : galleryImages.slice(0, 4)
                  ).map((entry) => absoluteUrl(entry.url))
                : video
                  ? [absoluteUrl(video.download.url)]
                  : [],
            links: [
              { label: "Comments", url: `${canonical}#discussion` },
              { label: "View author", url: authorUrl },
            ],
          }
        : false,
    title:
      post.type === "video"
        ? `${truncateTitle(post.title, 40)} · ${authorName} · ${SITE_NAME}`
        : `${postTitle} · ${SITE_NAME}`,
    description,
    path,
    type: post.type === "video" ? "video.other" : "article",
    image,
    video: video?.download,
    videoDuration: video?.durationSeconds,
    player: video?.player,
    twitterCard: video ? "player" : image ? "summary_large_image" : "summary",
    indexing: post.visibility === "unlisted" || !post.author.searchIndexable ? "noindex" : "index",
    publishedAt,
    modifiedAt,
    authorUrl,
    jsonLd,
  })
}
