import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import {
  getPublicSitemapCounts,
  listPublicPostSitemapRecords,
  listPublicProfileSitemapRecords,
  listPublicTagSitemapRecords,
} from "@/db/public-read-model"
import {
  SITEMAP_PAGE_SIZE,
  buildPostSitemapXml,
  buildProfileSitemapXml,
  buildStaticSitemapXml,
  buildTagSitemapXml,
  sitemapPageCount,
} from "@/lib/sitemap"
import type { AppRequestContext } from "@/server"
import { SITEMAP_CACHE_TAG } from "@/server/cache-tags"

const sitemapKindSchema = z.enum(["static", "posts", "profiles", "tags"])
const sitemapPageSchema = z.coerce.number().int().positive()

async function sitemapPage({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { kind: string; page: string }
}) {
  const kind = sitemapKindSchema.parse(params.kind)
  const page = sitemapPageSchema.parse(params.page)
  const origin = context.runtime.config.PUBLIC_APP_URL.origin
  const database = createD1Database(context.env.DB)
  const counts = await getPublicSitemapCounts(database)
  const pageCount = kind === "static" ? 1 : sitemapPageCount(counts[kind])
  if (page > pageCount) return new Response("Sitemap page not found.", { status: 404 })

  let body: string | null = null
  if (request.method !== "HEAD") {
    const offset = (page - 1) * SITEMAP_PAGE_SIZE
    body =
      kind === "static"
        ? buildStaticSitemapXml(origin)
        : kind === "posts"
          ? buildPostSitemapXml(
              origin,
              await listPublicPostSitemapRecords(database, offset, SITEMAP_PAGE_SIZE),
            )
          : kind === "profiles"
            ? buildProfileSitemapXml(
                origin,
                await listPublicProfileSitemapRecords(database, offset, SITEMAP_PAGE_SIZE),
              )
            : buildTagSitemapXml(
                origin,
                await listPublicTagSitemapRecords(database, offset, SITEMAP_PAGE_SIZE),
              )
  }

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

export const Route = createFileRoute("/sitemaps/$kind/$page")({
  server: { handlers: { GET: sitemapPage, HEAD: sitemapPage } },
})
