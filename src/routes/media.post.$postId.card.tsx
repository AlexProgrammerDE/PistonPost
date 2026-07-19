import outfitFontSource from "@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?inline"
import { createFileRoute } from "@tanstack/react-router"
import ImageResponse from "takumi-js/response"
import { z } from "zod"

import { TextPostSocialCard } from "@/components/TextPostSocialCard"
import { createD1Database } from "@/db/d1-database"
import { getPublishedPostRead } from "@/db/public-read-model"
import { markdownToPlainText } from "@/lib/markdown"
import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH } from "@/lib/seo"
import type { AppRequestContext } from "@/server"

async function textPostCard({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { postId: string }
}) {
  const postId = z.string().trim().min(1).max(64).safeParse(params.postId)
  if (!postId.success) return new Response("Not found", { status: 404 })

  const post = await getPublishedPostRead(createD1Database(context.env.DB), postId.data)
  if (!post || post.type !== "text") return new Response("Not found", { status: 404 })

  const response = new ImageResponse(
    <TextPostSocialCard
      title={post.title}
      excerpt={post.textContent ? markdownToPlainText(post.textContent) : ""}
      authorName={post.author.name}
      authorUsername={post.author.username}
      publishedAt={post.publishedAt}
    />,
    {
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      format: "png",
      fonts: [outfitFontSource],
      headers: {
        "Cache-Control":
          post.visibility === "public"
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  )

  try {
    await response.ready
  } catch {
    return new Response("Failed to generate image", { status: 500 })
  }

  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response
}

export const Route = createFileRoute("/media/post/$postId/card")({
  server: { handlers: { GET: textPostCard, HEAD: textPostCard } },
})
