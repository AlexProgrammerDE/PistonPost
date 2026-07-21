function safeNotificationPayload(data) {
  const fallback = {
    title: "PistonPost",
    body: "You have a new notification.",
    url: "/",
    tag: "pistonpost-notification",
  }
  if (!data || typeof data !== "object") return fallback
  const title = typeof data.title === "string" && data.title ? data.title : fallback.title
  const body = typeof data.body === "string" && data.body ? data.body : fallback.body
  const tag = typeof data.tag === "string" && data.tag ? data.tag : fallback.tag
  let url = fallback.url
  if (typeof data.url === "string") {
    try {
      const candidate = new URL(data.url, self.location.origin)
      if (candidate.origin === self.location.origin)
        url = candidate.pathname + candidate.search + candidate.hash
    } catch {
      url = fallback.url
    }
  }
  return { title, body, url, tag }
}

self.addEventListener("push", (event) => {
  let data
  try {
    data = event.data?.json()
  } catch {
    data = null
  }
  const payload = safeNotificationPayload(data)
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const rawUrl = event.notification.data?.url
  let target = new URL("/", self.location.origin)
  try {
    const candidate = new URL(typeof rawUrl === "string" ? rawUrl : "/", self.location.origin)
    if (candidate.origin === self.location.origin) target = candidate
  } catch {
    target = new URL("/", self.location.origin)
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const current = clients.find((client) => new URL(client.url).origin === self.location.origin)
      if (current) {
        await current.navigate(target.href)
        return current.focus()
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
