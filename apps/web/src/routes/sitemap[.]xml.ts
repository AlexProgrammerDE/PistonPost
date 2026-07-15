import { createD1Database } from "@pistonpost/db/d1-database"
import { listPublicSitemapRecords } from "@pistonpost/db/public-read-model"
import { createFileRoute } from "@tanstack/react-router"

import { buildSitemapXml } from "@/lib/sitemap"
import type { AppRequestContext } from "@/server"

async function sitemap({ request, context }: { request: Request; context: AppRequestContext }) {
  const records = await listPublicSitemapRecords(createD1Database(context.env.DB))
  const origin = context.runtime.config.PUBLIC_APP_URL.origin
  const body = request.method === "HEAD" ? null : buildSitemapXml(origin, records)
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
      "Content-Type": "application/xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: sitemap, HEAD: sitemap } },
})
