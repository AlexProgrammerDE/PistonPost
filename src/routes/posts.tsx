import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/posts")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Outlet,
})
