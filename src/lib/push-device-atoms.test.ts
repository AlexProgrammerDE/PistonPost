import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"

import { AtomRegistry } from "effect/reactivity"
import { toast } from "sonner"

import { disablePushAtom, enablePushAtom, pushDeviceStateAtom } from "@/lib/push-device-atoms"
import * as pushNotifications from "@/lib/push-notifications"

const supportsPushNotifications = spyOn(pushNotifications, "supportsPushNotifications")
const getOwnedPushSubscription = spyOn(pushNotifications, "getOwnedPushSubscription")
const toastInfo = spyOn(toast, "info")

const key = { userId: "user-1", vapidPublicKey: "server-key" }
const subscription = {} as PushSubscription
const originalDocument = globalThis.document
const originalNotification = globalThis.Notification

let requestPermission: () => Promise<NotificationPermission>

function settle() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function showPage() {
  globalThis.document.dispatchEvent(new Event("visibilitychange"))
}

function mountDevice() {
  const registry = AtomRegistry.make()
  registry.mount(pushDeviceStateAtom(key))
  registry.mount(enablePushAtom(key))
  registry.mount(disablePushAtom(key))
  return registry
}

describe("push device atoms", () => {
  beforeEach(() => {
    supportsPushNotifications.mockReturnValue(true)
    getOwnedPushSubscription.mockResolvedValue(null)
    toastInfo.mockImplementation(() => "")
    requestPermission = () => Promise.resolve("default")
    globalThis.document = Object.assign(new EventTarget(), {
      visibilityState: "visible",
    }) as unknown as Document
    globalThis.Notification = {
      permission: "default",
      requestPermission: () => requestPermission(),
    } as unknown as typeof Notification
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.Notification = originalNotification
  })

  afterAll(() => {
    supportsPushNotifications.mockRestore()
    getOwnedPushSubscription.mockRestore()
    toastInfo.mockRestore()
  })

  test("inspects the device again when the page becomes visible", async () => {
    const registry = mountDevice()
    expect(registry.get(pushDeviceStateAtom(key))).toBe("checking")
    await settle()
    expect(registry.get(pushDeviceStateAtom(key))).toBe("disabled")

    getOwnedPushSubscription.mockResolvedValue(subscription)
    showPage()
    await settle()

    expect(registry.get(pushDeviceStateAtom(key))).toBe("enabled")
  })

  test("drops inspections that finish while enabling is pending", async () => {
    const registry = mountDevice()
    await settle()
    const permission = Promise.withResolvers<NotificationPermission>()
    requestPermission = () => permission.promise

    registry.set(enablePushAtom(key), undefined)
    getOwnedPushSubscription.mockResolvedValue(subscription)
    showPage()
    await settle()

    expect(registry.get(pushDeviceStateAtom(key))).toBe("disabled")

    permission.resolve("denied")
    await settle()

    expect(registry.get(pushDeviceStateAtom(key))).toBe("denied")
    expect(toastInfo).not.toHaveBeenCalled()
  })
})
