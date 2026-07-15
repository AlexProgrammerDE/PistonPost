import { createFileRoute } from "@tanstack/react-router"

import type { AppRequestContext } from "@/server"
import { handleStreamWebhook } from "@/server/stream-webhook"

export const Route = createFileRoute("/api/stream/webhook")({
  server: {
    handlers: {
      POST: ({ request, context }: { request: Request; context: AppRequestContext }) =>
        handleStreamWebhook(request, context),
    },
  },
})
