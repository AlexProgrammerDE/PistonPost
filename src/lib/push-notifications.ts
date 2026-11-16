import { Schema } from "effect"

import { readPushOwner, writePushOwner } from "@/lib/pwa/local-store"
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

/** Tells whether a subscription was created with the server key the app uses now. */
export function pushSubscriptionUsesKey(
  subscription: { readonly options: { readonly applicationServerKey: ArrayBuffer | null } },
  vapidPublicKey: string,
) {
  const current = subscription.options.applicationServerKey
  if (!current) return false
  const actual = new Uint8Array(current)
  const expected = decodeVapidPublicKey(vapidPublicKey)
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  )
}

type PushOwnership = "owned" | "unclaimed" | "other-account"

/** Decides whether the signed-in account may use the push subscription in this browser. */
export function pushOwnership(owner: string | null, userId: string): PushOwnership {
  if (owner === null) return "unclaimed"
  return owner === userId ? "owned" : "other-account"
}

async function readPushOwnerOrUnknown() {
  try {
    return await readPushOwner()
  } catch {
    // Without local storage the owner is unknown. Treat it like a subscription from before owners
    // were recorded instead of turning push off on every load.
    return null
  }
}

export async function recordPushOwner(userId: string | null) {
  await writePushOwner(userId).catch(() => undefined)
}

/**
 * Returns this browser's push subscription when the signed-in account may use it. Push belongs to
 * the account that turned it on, so a subscription from another account is removed instead of
 * moving that browser's notifications to whoever signs in next.
 */
export async function getOwnedPushSubscription(userId: string) {
  const subscription = await getExistingPushSubscription()
  if (!subscription) return null
  const ownership = pushOwnership(await readPushOwnerOrUnknown(), userId)
  if (ownership === "other-account") {
    await subscription.unsubscribe()
    await recordPushOwner(null)
    return null
  }
  if (ownership === "unclaimed") await recordPushOwner(userId)
  return subscription
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
  return Schema.decodeUnknownSync(pushSubscriptionInputSchema, { errors: "all" })({
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: value.keys,
  })
}
