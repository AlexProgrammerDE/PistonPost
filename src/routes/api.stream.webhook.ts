import { createFileRoute } from "@tanstack/react-router"

import type { AppRequestContext } from "@/server"
import { handleStreamWebhook } from "@/server/stream-webhook"

/** Cloudflare Stream only posts to this endpoint. Other reads must not fall through to the app page. */
function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  })
}

export const Route = createFileRoute("/api/stream/webhook")({
  server: {
    handlers: {
      GET: methodNotAllowed,
      HEAD: methodNotAllowed,
      POST: ({ request, context }: { request: Request; context: AppRequestContext }) =>
        handleStreamWebhook(request, context),
    },
  },
})
