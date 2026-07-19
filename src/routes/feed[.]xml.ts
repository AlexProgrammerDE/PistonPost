import { createFileRoute } from "@tanstack/react-router"

import { listPublicAtomFeedRecords } from "@/db/atom-feed-read-model"
import { createD1Database } from "@/db/d1-database"
import { buildAtomFeedXml } from "@/lib/atom-feed"
import type { AppRequestContext } from "@/server"

async function atomFeed({ request, context }: { request: Request; context: AppRequestContext }) {
  const body =
    request.method === "HEAD"
      ? null
      : buildAtomFeedXml(
          context.runtime.config.PUBLIC_APP_URL.origin,
          await listPublicAtomFeedRecords(createD1Database(context.env.DB)),
        )
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "Content-Type": "application/atom+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export const Route = createFileRoute("/feed.xml")({
  server: { handlers: { GET: atomFeed, HEAD: atomFeed } },
})
