"use client"

import { useSession } from "@better-auth-ui/react"
import { useEffect } from "react"

import { authClient } from "@/auth/client"
import {
  getExistingPushSubscription,
  serializePushSubscription,
  supportsPushNotifications,
} from "@/lib/push-notifications"
import { upsertPushSubscription } from "@/server/push-subscriptions"

export function PushSubscriptionSync({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const { data: session, isPending } = useSession(authClient)
  const sessionId = session?.session.id

  useEffect(() => {
    if (isPending || !sessionId || !vapidPublicKey || !supportsPushNotifications()) return undefined
    if (Notification.permission !== "granted") return undefined

    let cancelled = false
    async function synchronize() {
      const subscription = await getExistingPushSubscription()
      if (!subscription || cancelled) return
      await upsertPushSubscription({ data: serializePushSubscription(subscription) })
    }
    void synchronize().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isPending, sessionId, vapidPublicKey])

  return null
}
