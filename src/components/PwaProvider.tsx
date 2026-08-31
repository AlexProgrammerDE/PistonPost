import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react"

import { authClient } from "@/auth/client"
import { FileLaunchHandler } from "@/components/FileLaunchHandler"
import { reconcileDraftAccount } from "@/lib/pwa/local-draft"
import { reconcileLocalAccount } from "@/lib/pwa/local-store"
import { registerAppWorker } from "@/lib/pwa/registration"

type InstallPrompt = Event & { prompt: () => Promise<{ outcome: "accepted" | "dismissed" }> }
type InstallState = { installed: boolean; prompt: InstallPrompt | null }

const PwaContext = createContext<InstallState>({ installed: false, prompt: null })

function isInstallPrompt(event: Event): event is InstallPrompt {
  return "prompt" in event && typeof event.prompt === "function"
}

export function useAppInstallation() {
  return useContext(PwaContext)
}

export function PwaProvider({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession()
  const userId = session?.user.id ?? null
  const [installation, setInstallation] = useState<InstallState>({ installed: false, prompt: null })

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)")
    const update = () =>
      setInstallation((state) => ({
        ...state,
        installed: display.matches || ("standalone" in navigator && navigator.standalone === true),
      }))
    const beforeInstall = (event: Event) => {
      if (!isInstallPrompt(event)) return
      event.preventDefault()
      setInstallation({ installed: false, prompt: event })
    }
    const installed = () => setInstallation({ installed: true, prompt: null })
    update()
    display.addEventListener("change", update)
    window.addEventListener("beforeinstallprompt", beforeInstall)
    window.addEventListener("appinstalled", installed)
    return () => {
      display.removeEventListener("change", update)
      window.removeEventListener("beforeinstallprompt", beforeInstall)
      window.removeEventListener("appinstalled", installed)
    }
  }, [])

  useEffect(() => {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return undefined
    const seen = () => {
      if (document.visibilityState !== "visible") return
      if ("clearAppBadge" in navigator) void navigator.clearAppBadge().catch(() => undefined)
    }
    void registerAppWorker()
      .then(seen)
      .catch(() => undefined)
    seen()
    document.addEventListener("visibilitychange", seen)
    navigator.serviceWorker.addEventListener("controllerchange", seen)
    return () => {
      document.removeEventListener("visibilitychange", seen)
      navigator.serviceWorker.removeEventListener("controllerchange", seen)
    }
  }, [])

  useEffect(() => {
    if (isPending) return
    try {
      reconcileDraftAccount(userId)
    } catch {
      /* Composing still works without local storage. */
    }
    void reconcileLocalAccount(userId).catch(() => undefined)
    if (!userId && "clearAppBadge" in navigator)
      void navigator.clearAppBadge().catch(() => undefined)
  }, [isPending, userId])

  return (
    <PwaContext value={installation}>
      <FileLaunchHandler />
      {children}
    </PwaContext>
  )
}
