"use client"

import { useSession } from "@better-auth-ui/react"
import { useAtom, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { BellOff, BellRing, TriangleAlert } from "lucide-react"

import { authClient } from "@/auth/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldTitle } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { disablePushAtom, enablePushAtom, pushDeviceStateAtom } from "@/lib/push-device-atoms"

export function PushDeviceSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const { data: session } = useSession(authClient)
  const key = { userId: session?.user.id ?? null, vapidPublicKey }
  const state = useAtomValue(pushDeviceStateAtom(key))
  const [enableResult, enable] = useAtom(enablePushAtom(key))
  const [disableResult, disable] = useAtom(disablePushAtom(key))
  const isUpdating = AsyncResult.isWaiting(enableResult) || AsyncResult.isWaiting(disableResult)

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
        onClick={() => {
          if (enabled) disable()
          else enable()
        }}
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
