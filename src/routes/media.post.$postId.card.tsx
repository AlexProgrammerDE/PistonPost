import outfitLatinExtendedFontSource from "@fontsource-variable/outfit/files/outfit-latin-ext-wght-normal.woff2?inline"
import outfitLatinFontSource from "@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?inline"
import { createFileRoute } from "@tanstack/react-router"
import { Schema, Result } from "effect"
import { ImageResponse } from "takumi-js/response"

import { TextPostSocialCard } from "@/components/TextPostSocialCard"
import { createD1Database } from "@/db/d1-database"
import { getPublishedPostRead } from "@/db/public-read-model"
import { postMarkdownToPlainText } from "@/lib/markdown"
import { textPostCardUrl } from "@/lib/post-seo"
import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH } from "@/lib/seo"
import { socialCardFallbackFonts } from "@/lib/social-card-fonts"
import type { AppRequestContext } from "@/server"
import { cacheTagHeader, ownerCacheTag, postCacheTag } from "@/server/cache-tags"

// The inline imports are data URLs. Takumi fetches them once per isolate and caches them by name.
function inlineFont(source: string) {
  return () => fetch(source).then((response) => response.arrayBuffer())
}

// Both subsets share the Outfit family, so names such as "Paweł" or "İlkay" do not render as boxes.
// Noto fallbacks cover the scripts Outfit lacks, such as Cyrillic, Arabic and CJK.
const cardFonts = [
  {
    name: "Outfit Latin",
    data: inlineFont(outfitLatinFontSource),
    subsetOf: "Outfit",
    subsetRank: 0,
  },
  {
    name: "Outfit Latin Extended",
    data: inlineFont(outfitLatinExtendedFontSource),
    subsetOf: "Outfit",
    subsetRank: 1,
  },
  ...socialCardFallbackFonts("Outfit", 2),
]

async function textPostCard({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { postId: string }
}) {
  const postId = Schema.decodeResult(
    Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
    { errors: "all" },
  )(params.postId)
  if (!Result.isSuccess(postId)) return new Response("Not found", { status: 404 })

  const database = createD1Database(context.env.DB)
  const post = await getPublishedPostRead(database, postId.success)
  if (post?.type !== "text") return new Response("Not found", { status: 404 })

  // Only the current versioned URL may render. Other query strings would each fill
  // the cache with an immutable copy.
  const canonicalUrl = textPostCardUrl(post)
  const requestUrl = new URL(request.url)
  if (`${requestUrl.pathname}${requestUrl.search}` !== canonicalUrl) {
    return new Response(null, {
      status: 307,
      headers: { "Cache-Control": "no-store", Location: canonicalUrl },
    })
  }

  const headers = {
    "Cache-Control":
      post.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
    ...(post.visibility === "public"
      ? { "Cache-Tag": cacheTagHeader([postCacheTag(post.id), ownerCacheTag(post.author.id)]) }
      : {}),
    "X-Content-Type-Options": "nosniff",
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: { ...headers, "Content-Type": "image/png" } })
  }

  const response = new ImageResponse(
    <TextPostSocialCard
      title={post.title}
      excerpt={post.textContent ? postMarkdownToPlainText(post.textContent) : ""}
      authorName={post.author.name}
      authorUsername={post.author.username}
      publishedAt={post.publishedAt}
    />,
    {
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      format: "png",
      fonts: cardFonts,
      headers,
    },
  )

  try {
    await response.ready
  } catch {
    return new Response("Failed to generate image", { status: 500 })
  }

  return response
}

export const Route = createFileRoute("/media/post/$postId/card")({
  server: { handlers: { GET: textPostCard, HEAD: textPostCard } },
})
