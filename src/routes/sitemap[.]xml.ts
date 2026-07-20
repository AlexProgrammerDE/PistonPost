import { createFileRoute } from "@tanstack/react-router"

import { createD1Database } from "@/db/d1-database"
import { getPublicSitemapCounts } from "@/db/public-read-model"
import { buildSitemapIndexXml } from "@/lib/sitemap"
import type { AppRequestContext } from "@/server"
import { SITEMAP_CACHE_TAG } from "@/server/cache-tags"

async function sitemap({ request, context }: { request: Request; context: AppRequestContext }) {
  const counts = await getPublicSitemapCounts(createD1Database(context.env.DB))
  const origin = context.runtime.config.PUBLIC_APP_URL.origin
  const body = request.method === "HEAD" ? null : buildSitemapIndexXml(origin, counts)
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0",
      "Cache-Tag": SITEMAP_CACHE_TAG,
      "Cloudflare-CDN-Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      "Content-Type": "application/xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: sitemap, HEAD: sitemap } },
})
