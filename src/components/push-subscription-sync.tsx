"use client"

import { useSession } from "@better-auth-ui/react"
import { useEffect } from "react"

import { authClient } from "@/auth/client"
import {
  createPushSubscription,
  getOwnedPushSubscription,
  pushSubscriptionUsesKey,
  serializePushSubscription,
  supportsPushNotifications,
} from "@/lib/push-notifications"
import { removePushSubscription, upsertPushSubscription } from "@/server/push-subscriptions"

export async function replaceOutdatedSubscription(
  subscription: PushSubscription,
  vapidPublicKey: string,
) {
  // A subscription made with an older server key can no longer receive push. Retire it on the
  // server first, then subscribe again with the current key.
  await removePushSubscription({ data: { endpoint: subscription.endpoint } }).catch(() => undefined)
  await subscription.unsubscribe()
  return createPushSubscription(vapidPublicKey)
}

export function PushSubscriptionSync({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const { data: session, isPending } = useSession(authClient)
  const sessionId = session?.session.id
  const userId = session?.user.id

  useEffect(() => {
    if (isPending || !sessionId || !userId || !vapidPublicKey || !supportsPushNotifications()) {
      return undefined
    }
    if (Notification.permission !== "granted") return undefined

    let cancelled = false
    async function synchronize(accountId: string, key: string) {
      const owned = await getOwnedPushSubscription(accountId)
      if (!owned || cancelled) return
      const subscription = pushSubscriptionUsesKey(owned, key)
        ? owned
        : await replaceOutdatedSubscription(owned, key)
      if (cancelled) return
      await upsertPushSubscription({ data: serializePushSubscription(subscription) })
    }
    void synchronize(userId, vapidPublicKey).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isPending, sessionId, userId, vapidPublicKey])

  return null
}
