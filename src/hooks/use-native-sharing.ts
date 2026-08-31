import { useSyncExternalStore } from "react"

import { canShareNatively } from "@/lib/pwa/native-share"

const subscribe = () => () => undefined
export function useNativeSharing() {
  return useSyncExternalStore(subscribe, canShareNatively, () => false)
}
