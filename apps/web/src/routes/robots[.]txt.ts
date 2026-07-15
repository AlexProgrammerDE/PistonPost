import { createFileRoute } from "@tanstack/react-router"

import { buildRobotsTxt } from "@/lib/sitemap"
import type { AppRequestContext } from "@/server"

function robots({ request, context }: { request: Request; context: AppRequestContext }) {
  const origin = context.runtime.config.PUBLIC_APP_URL.origin
  const indexable = context.runtime.config.APP_ENV === "production"
  const body = request.method === "HEAD" ? null : buildRobotsTxt(origin, indexable)
  return new Response(body, {
    headers: {
      "Cache-Control": indexable ? "public, max-age=3600" : "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: robots, HEAD: robots } },
})
