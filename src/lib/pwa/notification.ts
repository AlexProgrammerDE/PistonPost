export function safeNotificationPayload(data: unknown, origin: string) {
  const fallback = {
    title: "PistonPost",
    body: "You have a new notification.",
    url: "/",
    tag: "pistonpost-notification",
  }
  if (!data || typeof data !== "object") return fallback
  const title =
    "title" in data && typeof data.title === "string" && data.title ? data.title : fallback.title
  const body =
    "body" in data && typeof data.body === "string" && data.body ? data.body : fallback.body
  const tag = "tag" in data && typeof data.tag === "string" && data.tag ? data.tag : fallback.tag
  let url = fallback.url
  if ("url" in data && typeof data.url === "string") {
    try {
      const candidate = new URL(data.url, origin)
      if (candidate.origin === origin) url = candidate.pathname + candidate.search + candidate.hash
    } catch {
      /* Keep notification navigation on this origin. */
    }
  }
  return { title, body, url, tag }
}
