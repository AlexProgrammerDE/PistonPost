import { createPushSubscription } from "@/lib/push-notifications"
import { removePushSubscription } from "@/server/push-subscriptions"

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
