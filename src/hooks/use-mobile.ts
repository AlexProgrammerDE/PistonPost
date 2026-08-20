import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function getIsMobile() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

function getServerIsMobile() {
  return false
}

function subscribeToViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  mediaQuery.addEventListener("change", onStoreChange)
  return () => mediaQuery.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribeToViewport, getIsMobile, getServerIsMobile)
}
