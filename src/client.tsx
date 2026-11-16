import { StartClient } from "@tanstack/react-start/client"
import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"

window.addEventListener("vite:preloadError", (event) => {
  // Offline, let the import fail. The router then shows its error view with Try again, which works
  // after reconnecting. Preventing the default here would resolve the import to undefined, and a
  // reload would replace the page with the offline fallback.
  if (!navigator.onLine) return

  // A new deploy removed the old chunk. Avoid reload loops for genuine network failures, and let
  // those fail into the error view as well.
  const key = "vite-preload-reload"
  const lastReload = Number(sessionStorage.getItem(key) ?? 0)

  if (Date.now() - lastReload > 10_000) {
    event.preventDefault()
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)
