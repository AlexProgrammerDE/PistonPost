/// <reference lib="webworker" />

import { stageSharedContent } from "./local-store"
import { safeNotificationPayload } from "./notification"
import { MAX_SHARED_BYTES, sharedContentSchema } from "./share-intake"

declare const self: ServiceWorkerGlobalScope

const OFFLINE_CACHE = "pistonpost-offline-v1"
const OFFLINE_ASSETS = ["/offline.html", "/offline.css", "/offline.js"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(async (cache) => {
      await cache.addAll(OFFLINE_ASSETS)
      // No application documents or versioned app assets are cached, so taking over is safe.
      await self.skipWaiting()
    }),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith("pistonpost-offline-") && key !== OFFLINE_CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

async function receiveShare(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data") || !request.body) {
      throw new Error("Unsupported share")
    }
    // Content-Length is not reliable. Bound the streamed body before parsing multipart data.
    const reader = request.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let bytes = 0
    while (true) {
      // Read incrementally to enforce the limit without buffering an unbounded body.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_SHARED_BYTES + 128 * 1024) {
        void reader.cancel()
        throw new Error("Share too large")
      }
      chunks.push(new Uint8Array(value))
    }
    const form = await new Response(new Blob(chunks), { headers: request.headers }).formData()
    const content = sharedContentSchema.parse({
      title: form.get("title") ?? "",
      text: form.get("text") ?? "",
      url: form.get("url") ?? "",
      files: form.getAll("files").filter((value) => value instanceof File && value.size > 0),
    })
    const id = await stageSharedContent(content)
    return Response.redirect(new URL(`/posts/new?shareId=${id}`, self.location.origin), 303)
  } catch {
    return Response.redirect(
      new URL("/posts/new?shareError=unavailable", self.location.origin),
      303,
    )
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === "/share" && event.request.method === "POST") {
    event.respondWith(receiveShare(event.request))
    return
  }
  if (event.request.method !== "GET") return
  if (OFFLINE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(OFFLINE_CACHE)
        .then(async (cache) => (await cache.match(url.pathname)) ?? fetch(event.request)),
    )
  } else if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const fallback = await caches.match("/offline.html", { cacheName: OFFLINE_CACHE })
        return (
          fallback ?? new Response("You are offline. Reconnect and try again.", { status: 503 })
        )
      }),
    )
  }
})

async function clearBadge() {
  if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge().catch(() => undefined)
}

self.addEventListener("push", (event) => {
  let data: unknown
  try {
    data = event.data?.json()
  } catch {
    data = null
  }
  const payload = safeNotificationPayload(data, self.location.origin)
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/notification-badge.svg",
        tag: payload.tag,
        data: { url: payload.url },
      })
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      if (clients.some((client) => client.visibilityState === "visible")) await clearBadge()
      else if ("setAppBadge" in self.navigator)
        await self.navigator.setAppBadge().catch(() => undefined)
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const payload = safeNotificationPayload(event.notification.data, self.location.origin)
  const target = new URL(payload.url, self.location.origin)
  event.waitUntil(
    (async () => {
      await clearBadge()
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const current = clients.find((client) => client.url === target.href)
      // Do not navigate an unrelated tab away from an unfinished post.
      if (current) await current.focus()
      else await self.clients.openWindow(target.href)
    })(),
  )
})
