import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import {
  externalImageProxyUrl,
  isProxyableExternalImageUrl,
  markdownContainsImageUrl,
} from "@/lib/markdown"
import type { AppRequestContext } from "@/server"
import { cacheTagHeader, ownerCacheTag, postCacheTag } from "@/server/cache-tags"

const MAX_EXTERNAL_IMAGE_BYTES = 15 * 1024 * 1024
const allowedImageTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

function limitImageBody(body: ReadableStream<Uint8Array>) {
  let receivedBytes = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength
        if (receivedBytes > MAX_EXTERNAL_IMAGE_BYTES) {
          controller.error(new Error("External image exceeds the upload limit."))
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}

async function fetchExternalImage(
  sourceUrl: string,
  redirectsRemaining = 3,
): Promise<Response | null> {
  const response = await fetch(sourceUrl, {
    redirect: "manual",
    headers: { Accept: "image/avif,image/webp,image/*" },
  })
  if (response.status < 300 || response.status >= 400) return response
  if (redirectsRemaining === 0) return null

  const location = response.headers.get("location")
  if (!location) return null
  const redirectUrl = new URL(location, sourceUrl).toString()
  if (!isProxyableExternalImageUrl(redirectUrl)) return null
  return fetchExternalImage(redirectUrl, redirectsRemaining - 1)
}

async function deliverExternalImage({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { postId: string }
}) {
  const input = z
    .object({
      postId: z.string().min(1).max(64),
      source: z.string().url().max(2_048),
    })
    .safeParse({
      postId: params.postId,
      source: new URL(request.url).searchParams.get("source"),
    })
  if (!input.success || !isProxyableExternalImageUrl(input.data.source)) {
    return new Response("Not found", { status: 404 })
  }
  const requestUrl = new URL(request.url)
  const canonicalUrl = externalImageProxyUrl(input.data.postId, input.data.source)
  if (`${requestUrl.pathname}${requestUrl.search}` !== canonicalUrl) {
    return new Response(null, {
      status: 307,
      headers: { "Cache-Control": "no-store", Location: canonicalUrl },
    })
  }

  const post = await createD1Database(context.env.DB)
    .select({
      authorId: schema.posts.authorId,
      textContent: schema.posts.textContent,
      visibility: schema.posts.visibility,
    })
    .from(schema.posts)
    .where(and(eq(schema.posts.id, input.data.postId), eq(schema.posts.status, "published")))
    .get()
  if (!post?.textContent || !markdownContainsImageUrl(post.textContent, input.data.source)) {
    return new Response("Not found", { status: 404 })
  }

  const source = await fetchExternalImage(input.data.source)
  if (!source?.ok || !source.body) return new Response("Not found", { status: 404 })
  const contentType = source.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  const contentLengthHeader = source.headers.get("content-length")
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null
  if (
    !contentType ||
    !allowedImageTypes.has(contentType) ||
    (contentLength !== null &&
      (!Number.isSafeInteger(contentLength) ||
        contentLength < 1 ||
        contentLength > MAX_EXTERNAL_IMAGE_BYTES))
  ) {
    return new Response("Unsupported image", { status: 415 })
  }

  const transformed = await context.env.IMAGES.input(limitImageBody(source.body))
    .transform({ width: 1_600, height: 1_600, fit: "scale-down" })
    .output({ format: "image/webp", quality: 82, anim: false })
    .catch(() => null)
  if (!transformed) return new Response("Unsupported image", { status: 415 })
  const response = transformed.response()
  const headers = new Headers(response.headers)
  headers.set("Content-Type", transformed.contentType())
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set(
    "Cache-Control",
    post.visibility === "public" ? "public, max-age=86400" : "private, no-store",
  )
  if (post.visibility === "public") {
    headers.set(
      "Cloudflare-CDN-Cache-Control",
      "public, max-age=604800, stale-while-revalidate=86400",
    )
    headers.set(
      "Cache-Tag",
      cacheTagHeader([postCacheTag(input.data.postId), ownerCacheTag(post.authorId)]),
    )
  }
  return new Response(response.body, { status: response.status, headers })
}

export const Route = createFileRoute("/media/external-image/$postId")({
  server: { handlers: { GET: deliverExternalImage } },
})
