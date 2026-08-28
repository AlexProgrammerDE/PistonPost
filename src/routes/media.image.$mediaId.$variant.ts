import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import {
  AVATAR_IMAGE_SIZE,
  isMediaImageVariantAllowed,
  isResponsiveMediaImageVariant,
  MEDIA_IMAGE_CACHE_VERSIONS,
  mediaImageUrl,
  parseMediaImageAnimation,
  parseResponsiveMediaWidth,
  responsiveMediaImageMaxWidth,
  SOCIAL_MEDIA_IMAGE_MAX_SIZE,
  shouldPreserveMediaImageAnimation,
  type MediaImageAnimation,
  type MediaImageVariant,
} from "@/lib/media-image"
import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"
import { cacheTagHeader, mediaCacheTag, ownerCacheTag, postCacheTag } from "@/server/cache-tags"
import { requestValidatorsMatch } from "@/server/http-cache"

const variants = {
  avatar: {
    width: AVATAR_IMAGE_SIZE,
    height: AVATAR_IMAGE_SIZE,
    fit: "cover" as const,
    quality: 82,
  },
  feed: { width: 1280, height: 1280, fit: "scale-down" as const, quality: 82 },
  detail: { width: 2400, height: 2400, fit: "scale-down" as const, quality: 88 },
  thumbnail: { width: 480, height: 360, fit: "cover" as const, quality: 76 },
  og: {
    width: SOCIAL_MEDIA_IMAGE_MAX_SIZE,
    height: SOCIAL_MEDIA_IMAGE_MAX_SIZE,
    fit: "scale-down" as const,
    quality: 84,
  },
} as const

const routeInput = z.object({
  mediaId: z.string().uuid(),
  variant: z.enum(["avatar", "feed", "detail", "thumbnail", "og"]),
})

type ImageHandlerArguments = {
  request: Request
  context: AppRequestContext
  params: { mediaId: string; variant: string }
}

type ResolvedImageRequest = {
  readonly animation: MediaImageAnimation
  readonly asset: typeof schema.mediaAssets.$inferSelect
  readonly postId: string | null
  readonly publiclyCacheable: boolean
  readonly requestedWidth: number | undefined
  readonly r2Key: string
  readonly variant: MediaImageVariant
}

async function resolveImageRequest({
  request,
  context,
  params,
}: ImageHandlerArguments): Promise<ResolvedImageRequest | Response> {
  const input = routeInput.safeParse(params)
  if (!input.success) return new Response("Not found", { status: 404 })
  const searchParams = new URL(request.url).searchParams
  const requestedWidth = parseResponsiveMediaWidth(searchParams.get("width"))
  if (requestedWidth === null) return new Response("Not found", { status: 404 })
  const animation = parseMediaImageAnimation(searchParams.get("animation"))
  if (animation === null) return new Response("Not found", { status: 404 })
  const canonicalUrl = mediaImageUrl(
    input.data.mediaId,
    input.data.variant,
    requestedWidth,
    animation,
  )
  const requestUrl = new URL(request.url)
  if (`${requestUrl.pathname}${requestUrl.search}` !== canonicalUrl) {
    return new Response(null, {
      status: 307,
      headers: { "Cache-Control": "no-store", Location: canonicalUrl },
    })
  }

  const database = createD1Database(context.env.DB)
  const rows = await database
    .select({
      asset: schema.mediaAssets,
      postStatus: schema.posts.status,
      postId: schema.posts.id,
      visibility: schema.posts.visibility,
      avatarOwnerId: schema.profiles.userId,
    })
    .from(schema.mediaAssets)
    .leftJoin(schema.postMedia, eq(schema.postMedia.mediaId, schema.mediaAssets.id))
    .leftJoin(schema.posts, eq(schema.posts.id, schema.postMedia.postId))
    .leftJoin(schema.profiles, eq(schema.profiles.avatarMediaId, schema.mediaAssets.id))
    .where(
      and(eq(schema.mediaAssets.id, input.data.mediaId), eq(schema.mediaAssets.status, "ready")),
    )
  const row = rows[0]
  if (!row?.asset.r2Key) return new Response("Not found", { status: 404 })
  const avatarRequest = input.data.variant === "avatar"
  if (
    !isMediaImageVariantAllowed(row.asset.kind, input.data.variant) ||
    (avatarRequest && !row.avatarOwnerId)
  ) {
    return new Response("Not found", { status: 404 })
  }

  if (requestedWidth !== undefined) {
    if (!isResponsiveMediaImageVariant(input.data.variant)) {
      return new Response("Not found", { status: 404 })
    }
    const maxWidth = responsiveMediaImageMaxWidth(row.asset, input.data.variant)
    if (requestedWidth > maxWidth) return new Response("Not found", { status: 404 })
  }

  const isPublished = row.postStatus === "published"
  if (!isPublished && row.asset.kind !== "avatar") {
    const auth = await createRequestAuth(context)
    const session = await auth.api.getSession({ headers: request.headers })
    if (session?.user.id !== row.asset.ownerId) return new Response("Not found", { status: 404 })
  }

  return {
    animation,
    asset: row.asset,
    postId: row.postId,
    publiclyCacheable: (isPublished && row.visibility === "public") || row.asset.kind === "avatar",
    requestedWidth,
    r2Key: row.asset.r2Key,
    variant: input.data.variant,
  }
}

function imageEntityTag(image: ResolvedImageRequest, object: R2Object) {
  const rendition =
    image.requestedWidth === undefined ? "default" : `width-${image.requestedWidth.toString()}`
  return `"${object.etag}-${image.variant}-v${MEDIA_IMAGE_CACHE_VERSIONS[
    image.variant
  ].toString()}-${rendition}-${image.animation}"`
}

function imageResponseHeaders(
  image: ResolvedImageRequest,
  object: R2Object,
  responseHeaders?: HeadersInit,
) {
  const headers = new Headers(responseHeaders)
  headers.set("Content-Type", image.variant === "og" ? "image/jpeg" : "image/webp")
  headers.set("ETag", imageEntityTag(image, object))
  headers.set("Last-Modified", object.uploaded.toUTCString())
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set(
    "Cache-Control",
    image.publiclyCacheable
      ? image.asset.kind === "avatar"
        ? "public, max-age=3600"
        : "public, max-age=31536000, immutable"
      : "private, no-store",
  )
  if (image.publiclyCacheable) {
    headers.set(
      "Cache-Tag",
      cacheTagHeader([
        mediaCacheTag(image.asset.id),
        ...(image.asset.ownerId ? [ownerCacheTag(image.asset.ownerId)] : []),
        ...(image.postId ? [postCacheTag(image.postId)] : []),
      ]),
    )
  }
  return headers
}

function notModifiedResponse(request: Request, image: ResolvedImageRequest, object: R2Object) {
  const headers = imageResponseHeaders(image, object)
  return requestValidatorsMatch(request, headers.get("ETag") ?? "", object.uploaded)
    ? new Response(null, { status: 304, headers })
    : undefined
}

async function deliverImage(arguments_: ImageHandlerArguments) {
  const image = await resolveImageRequest(arguments_)
  if (image instanceof Response) return image

  const object = await arguments_.context.env.MEDIA.get(image.r2Key)
  if (!object) return new Response("Not found", { status: 404 })
  const notModified = notModifiedResponse(arguments_.request, image, object)
  if (notModified) return notModified

  const selected = variants[image.variant]
  const transform: ImageTransform =
    image.requestedWidth === undefined
      ? { width: selected.width, height: selected.height, fit: selected.fit }
      : image.variant === "avatar"
        ? { width: image.requestedWidth, height: image.requestedWidth, fit: "cover" }
        : { width: image.requestedWidth, fit: "scale-down" }
  const transformed = await arguments_.context.env.IMAGES.input(object.body)
    .transform(transform)
    .output({
      format: image.variant === "og" ? "image/jpeg" : "image/webp",
      quality: selected.quality,
      anim: shouldPreserveMediaImageAnimation(image.asset.mimeType, image.variant, image.animation),
    })
  const response = transformed.response()
  const headers = imageResponseHeaders(image, object, response.headers)
  headers.set("Content-Type", transformed.contentType())
  return new Response(response.body, { status: response.status, headers })
}

async function deliverImageHead(arguments_: ImageHandlerArguments) {
  const image = await resolveImageRequest(arguments_)
  if (image instanceof Response) return image

  const object = await arguments_.context.env.MEDIA.head(image.r2Key)
  if (!object) return new Response("Not found", { status: 404 })
  return (
    notModifiedResponse(arguments_.request, image, object) ??
    new Response(null, { status: 200, headers: imageResponseHeaders(image, object) })
  )
}

export const Route = createFileRoute("/media/image/$mediaId/$variant")({
  server: { handlers: { GET: deliverImage, HEAD: deliverImageHead } },
})
