import { pushSubscriptionInputSchema, type PushSubscriptionInput } from "@/push/subscription"

const serviceWorkerPath = "/push-sw.js"

export function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export function decodeVapidPublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/")
  const decoded = atob(base64)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

export async function getPushServiceWorker() {
  return navigator.serviceWorker.register(serviceWorkerPath, {
    scope: "/",
    updateViaCache: "none",
  })
}

export async function getExistingPushSubscription() {
  if (!supportsPushNotifications() || Notification.permission !== "granted") return null
  const registration = await getPushServiceWorker()
  return registration.pushManager.getSubscription()
}

export async function createPushSubscription(vapidPublicKey: string) {
  const registration = await getPushServiceWorker()
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidPublicKey(vapidPublicKey),
  })
}

export function serializePushSubscription(subscription: PushSubscription): PushSubscriptionInput {
  const value = subscription.toJSON()
  return pushSubscriptionInputSchema.parse({
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: value.keys,
  })
}
