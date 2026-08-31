import { getActiveAppWorker } from "@/lib/pwa/registration"
import { pushSubscriptionInputSchema, type PushSubscriptionInput } from "@/push/subscription"

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

export async function getExistingPushSubscription() {
  if (!supportsPushNotifications() || Notification.permission !== "granted") return null
  const registration = await getActiveAppWorker()
  return registration.pushManager.getSubscription()
}

export async function createPushSubscription(vapidPublicKey: string) {
  const registration = await getActiveAppWorker()
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
