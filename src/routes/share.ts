import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/share")({
  server: {
    handlers: {
      POST: () =>
        new Response("Open PistonPost while online, then share again. No post was created.", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "private, no-store",
          },
        }),
      GET: () =>
        new Response(null, {
          status: 303,
          headers: { Location: "/posts/new", "Cache-Control": "private, no-store" },
        }),
    },
  },
})
