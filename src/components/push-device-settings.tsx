"use client"

import { useSession } from "@better-auth-ui/react"
import { BellOff, BellRing, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { replaceOutdatedSubscription } from "@/components/push-subscription-sync"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldTitle } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  createPushSubscription,
  getExistingPushSubscription,
  getOwnedPushSubscription,
  pushSubscriptionUsesKey,
  recordPushOwner,
  serializePushSubscription,
  supportsPushNotifications,
} from "@/lib/push-notifications"
import { removePushSubscription, upsertPushSubscription } from "@/server/push-subscriptions"

type DeviceState = "checking" | "disabled" | "enabled" | "denied" | "unsupported" | "not-configured"

export function PushDeviceSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const { data: session } = useSession(authClient)
  const userId = session?.user.id ?? null
  const [state, setState] = useState<DeviceState>("checking")
  const [isUpdating, setIsUpdating] = useState(false)
  const updatingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let permissionStatus: PermissionStatus | null = null
    const apply = (next: DeviceState) => {
      if (!cancelled && !updatingRef.current) setState(next)
    }
    async function inspect() {
      if (!vapidPublicKey) return apply("not-configured")
      if (!supportsPushNotifications()) return apply("unsupported")
      if (Notification.permission === "denied") return apply("denied")
      if (!userId) return apply("checking")
      const subscription = await getOwnedPushSubscription(userId)
      apply(subscription ? "enabled" : "disabled")
    }
    const refresh = () => {
      void inspect().catch(() => apply("disabled"))
    }
    // People fix a blocked permission in browser or device settings, then come back.
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }

    refresh()
    document.addEventListener("visibilitychange", refreshWhenVisible)
    if (vapidPublicKey && supportsPushNotifications() && "permissions" in navigator) {
      void navigator.permissions
        .query({ name: "notifications" })
        .then((status) => {
          if (cancelled) return
          permissionStatus = status
          status.addEventListener("change", refresh)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", refreshWhenVisible)
      permissionStatus?.removeEventListener("change", refresh)
    }
  }, [userId, vapidPublicKey])

  function startUpdate() {
    updatingRef.current = true
    setIsUpdating(true)
  }

  function finishUpdate() {
    updatingRef.current = false
    setIsUpdating(false)
  }

  async function enable() {
    if (!vapidPublicKey || !userId) return
    startUpdate()
    try {
      const permission = await Notification.requestPermission()
      if (permission === "denied") {
        setState("denied")
        return
      }
      if (permission !== "granted") {
        setState("disabled")
        toast.info("Push stays off. Turn it on again when you want notifications on this device.")
        return
      }
      const existing = await getOwnedPushSubscription(userId)
      const subscription = !existing
        ? await createPushSubscription(vapidPublicKey)
        : pushSubscriptionUsesKey(existing, vapidPublicKey)
          ? existing
          : await replaceOutdatedSubscription(existing, vapidPublicKey)
      await upsertPushSubscription({ data: serializePushSubscription(subscription) })
      await recordPushOwner(userId)
      setState("enabled")
      toast.success("Push notifications are on for this device")
    } catch {
      toast.error("Push notifications could not be turned on. Try again.")
    } finally {
      finishUpdate()
    }
  }

  async function disable() {
    startUpdate()
    try {
      const subscription = await getExistingPushSubscription()
      if (subscription) {
        await removePushSubscription({ data: { endpoint: subscription.endpoint } })
        await subscription.unsubscribe()
      }
      await recordPushOwner(null)
      setState("disabled")
      toast.success("Push notifications are off for this device")
    } catch {
      toast.error("Push notifications could not be turned off. Try again.")
    } finally {
      finishUpdate()
    }
  }

  if (state === "not-configured") {
    return (
      <Alert>
        <BellOff aria-hidden="true" />
        <AlertTitle>Push is not available yet</AlertTitle>
        <AlertDescription>
          PistonPost cannot send push notifications right now. Email notifications still work.
        </AlertDescription>
      </Alert>
    )
  }

  if (state === "unsupported") {
    return (
      <Alert>
        <BellOff aria-hidden="true" />
        <AlertTitle>Push is not available here</AlertTitle>
        <AlertDescription>
          This browser does not offer web push in its current mode. On iPhone or iPad, install
          PistonPost to the Home Screen first.
        </AlertDescription>
      </Alert>
    )
  }

  if (state === "denied") {
    return (
      <Alert>
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Notifications are blocked</AlertTitle>
        <AlertDescription>
          Allow notifications for PistonPost in your browser or device settings. This page updates
          when you come back.
        </AlertDescription>
      </Alert>
    )
  }

  const enabled = state === "enabled"
  return (
    <Field orientation="responsive" className="items-center">
      <FieldContent>
        <FieldTitle>
          {state === "checking"
            ? "Push on this device"
            : enabled
              ? "Push is on for this device"
              : "Push is off for this device"}
        </FieldTitle>
        <FieldDescription>
          {state === "checking"
            ? "Checking whether this browser can receive push notifications."
            : enabled
              ? "This browser can get PistonPost notifications even when the site is closed."
              : "Your browser will ask for permission when you turn on push."}
        </FieldDescription>
      </FieldContent>
      <Button
        type="button"
        variant={enabled ? "outline" : "default"}
        disabled={state === "checking" || isUpdating}
        onClick={() => void (enabled ? disable() : enable())}
      >
        {isUpdating || state === "checking" ? (
          <Spinner data-icon="inline-start" />
        ) : enabled ? (
          <BellOff aria-hidden="true" data-icon="inline-start" />
        ) : (
          <BellRing aria-hidden="true" data-icon="inline-start" />
        )}
        {state === "checking"
          ? "Checking device"
          : isUpdating
            ? "Updating"
            : enabled
              ? "Turn off on this device"
              : "Turn on for this device"}
      </Button>
    </Field>
  )
}
