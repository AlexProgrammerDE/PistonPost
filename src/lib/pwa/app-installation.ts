import { createContext, useContext } from "react"

export type InstallPrompt = Event & { prompt: () => Promise<{ outcome: "accepted" | "dismissed" }> }
export type InstallState = { installed: boolean; prompt: InstallPrompt | null }

export const PwaContext = createContext<InstallState>({ installed: false, prompt: null })

export function useAppInstallation() {
  return useContext(PwaContext)
}
