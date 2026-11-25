import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity"
import * as Schema from "effect/Schema"
import { toast } from "sonner"

import {
  createPushSubscription,
  getExistingPushSubscription,
  getOwnedPushSubscription,
  pushSubscriptionUsesKey,
  recordPushOwner,
  serializePushSubscription,
  supportsPushNotifications,
} from "@/lib/push-notifications"
import { replaceOutdatedSubscription } from "@/lib/push-subscription-replacement"
import { removePushSubscription, upsertPushSubscription } from "@/server/push-subscriptions"

export type PushDeviceState =
  | "checking"
  | "disabled"
  | "enabled"
  | "denied"
  | "unsupported"
  | "not-configured"

export type PushDeviceKey = {
  readonly userId: string | null
  readonly vapidPublicKey: string | null
}

class PushDeviceUpdateError extends Schema.TaggedError<
  PushDeviceUpdateError,
  { readonly brand: unique symbol }
>()("PushDeviceUpdateError", { cause: Schema.Unknown }) {}

function tryPushUpdate<A>(run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => PushDeviceUpdateError.make({ cause }),
  })
}

async function inspectPushDevice({ userId, vapidPublicKey }: PushDeviceKey) {
  if (!vapidPublicKey) return "not-configured"
  if (!supportsPushNotifications()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  if (!userId) return "checking"
  const subscription = await getOwnedPushSubscription(userId)
  return subscription ? "enabled" : "disabled"
}

/**
 * Changes when the page becomes visible or the notification permission changes. People fix a
 * blocked permission in browser or device settings, then come back.
 */
const pushDeviceRefreshSignal = Atom.readable((get) => {
  let count = 0
  const bump = () => {
    get.setSelf(++count)
  }
  const bumpWhenVisible = () => {
    if (document.visibilityState === "visible") bump()
  }
  document.addEventListener("visibilitychange", bumpWhenVisible)
  get.addFinalizer(() => {
    document.removeEventListener("visibilitychange", bumpWhenVisible)
  })

  if (supportsPushNotifications() && "permissions" in navigator) {
    let active = true
    let permissionStatus: PermissionStatus | null = null
    get.addFinalizer(() => {
      active = false
      permissionStatus?.removeEventListener("change", bump)
    })
    const watchPermission = async () => {
      const status = await navigator.permissions.query({ name: "notifications" })
      if (!active) return
      permissionStatus = status
      status.addEventListener("change", bump)
    }
    watchPermission().catch(() => undefined)
  }
  return count
})

function isUpdating(registry: AtomRegistry.AtomRegistry, key: PushDeviceKey) {
  return (
    AsyncResult.isWaiting(registry.get(enablePushAtom(key))) ||
    AsyncResult.isWaiting(registry.get(disablePushAtom(key)))
  )
}

/**
 * The push state of this browser for one user. Each refresh signal inspects the device again. A
 * pending enable or disable owns the state, so inspections that finish meanwhile are dropped.
 * Server rendering shows the checking state, because push support lives in the browser.
 */
export const pushDeviceStateAtom = Atom.family((key: PushDeviceKey) =>
  Atom.writable(
    (get): PushDeviceState => {
      get(pushDeviceRefreshSignal)
      let active = true
      get.addFinalizer(() => {
        active = false
      })
      const apply = async () => {
        const next = await inspectPushDevice(key).catch((): PushDeviceState => "disabled")
        if (active && !isUpdating(get.registry, key)) get.setSelf(next)
      }
      void apply()
      return Option.getOrElse(get.self<PushDeviceState>(), (): PushDeviceState => "checking")
    },
    (ctx, next: PushDeviceState) => {
      ctx.setSelf(next)
    },
  ).pipe(Atom.withServerValue((): PushDeviceState => "checking")),
)

export const enablePushAtom = Atom.family((key: PushDeviceKey) =>
  Atom.fn((_, get) =>
    Effect.gen(function* () {
      const { userId, vapidPublicKey } = key
      if (!vapidPublicKey || !userId) return
      const setState = (next: PushDeviceState) => {
        get.set(pushDeviceStateAtom(key), next)
      }
      const permission = yield* tryPushUpdate(() => Notification.requestPermission())
      if (permission === "denied") {
        setState("denied")
        return
      }
      if (permission !== "granted") {
        setState("disabled")
        toast.info("Push stays off. Turn it on again when you want notifications on this device.")
        return
      }
      yield* tryPushUpdate(async () => {
        const existing = await getOwnedPushSubscription(userId)
        const subscription = !existing
          ? await createPushSubscription(vapidPublicKey)
          : pushSubscriptionUsesKey(existing, vapidPublicKey)
            ? existing
            : await replaceOutdatedSubscription(existing, vapidPublicKey)
        await upsertPushSubscription({ data: serializePushSubscription(subscription) })
        await recordPushOwner(userId)
      })
      setState("enabled")
      toast.success("Push notifications are on for this device")
    }).pipe(
      Effect.catchTag("PushDeviceUpdateError", () =>
        Effect.sync(() => {
          toast.error("Push notifications could not be turned on. Try again.")
        }),
      ),
    ),
  ),
)

export const disablePushAtom = Atom.family((key: PushDeviceKey) =>
  Atom.fn((_, get) =>
    Effect.gen(function* () {
      yield* tryPushUpdate(async () => {
        const subscription = await getExistingPushSubscription()
        if (subscription) {
          await removePushSubscription({ data: { endpoint: subscription.endpoint } })
          await subscription.unsubscribe()
        }
        await recordPushOwner(null)
      })
      get.set(pushDeviceStateAtom(key), "disabled")
      toast.success("Push notifications are off for this device")
    }).pipe(
      Effect.catchTag("PushDeviceUpdateError", () =>
        Effect.sync(() => {
          toast.error("Push notifications could not be turned off. Try again.")
        }),
      ),
    ),
  ),
)
