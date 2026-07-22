"use client"

import { BellOff, BellRing, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldTitle } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  createPushSubscription,
  getExistingPushSubscription,
  serializePushSubscription,
  supportsPushNotifications,
} from "@/lib/push-notifications"
import { removePushSubscription, upsertPushSubscription } from "@/server/push-subscriptions"

type DeviceState = "checking" | "disabled" | "enabled" | "denied" | "unsupported"

export function PushDeviceSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<DeviceState>("checking")
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function inspect() {
      if (!vapidPublicKey || !supportsPushNotifications()) {
        if (!cancelled) setState("unsupported")
        return
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied")
        return
      }
      const subscription = await getExistingPushSubscription()
      if (!cancelled) setState(subscription ? "enabled" : "disabled")
    }
    void inspect().catch(() => {
      if (!cancelled) setState("disabled")
    })
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey])

  async function enable() {
    if (!vapidPublicKey) return
    setIsUpdating(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disabled")
        return
      }
      const existing = await getExistingPushSubscription()
      const subscription = existing ?? (await createPushSubscription(vapidPublicKey))
      await upsertPushSubscription({ data: serializePushSubscription(subscription) })
      setState("enabled")
      toast.success("Push notifications enabled on this device")
    } catch {
      toast.error("Push notifications could not be enabled. Try again.")
    } finally {
      setIsUpdating(false)
    }
  }

  async function disable() {
    setIsUpdating(true)
    try {
      const subscription = await getExistingPushSubscription()
      if (subscription) {
        await removePushSubscription({ data: { endpoint: subscription.endpoint } })
        await subscription.unsubscribe()
      }
      setState("disabled")
      toast.success("Push notifications disabled on this device")
    } catch {
      toast.error("Push notifications could not be disabled. Try again.")
    } finally {
      setIsUpdating(false)
    }
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
          Allow notifications for PistonPost in your browser or device settings, then return here.
        </AlertDescription>
      </Alert>
    )
  }

  const enabled = state === "enabled"
  return (
    <Field orientation="responsive" className="items-center">
      <FieldContent>
        <FieldTitle>{enabled ? "Enabled on this device" : "This device is off"}</FieldTitle>
        <FieldDescription>
          {enabled
            ? "This browser can receive PistonPost alerts even when the site is closed."
            : "Your browser will ask for permission when you enable push."}
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
              ? "Disable on this device"
              : "Enable on this device"}
      </Button>
    </Field>
  )
}
