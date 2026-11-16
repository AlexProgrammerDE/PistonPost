import { StartClient } from "@tanstack/react-start/client"
import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault()

  // Offline, a reload would replace the page someone is reading with the offline fallback. Leave
  // it in place; the next navigation after reconnecting loads the chunk normally.
  if (!navigator.onLine) return

  // A new deploy removed the old chunk. Avoid reload loops for genuine network failures.
  const key = "vite-preload-reload"
  const lastReload = Number(sessionStorage.getItem(key) ?? 0)

  if (Date.now() - lastReload > 10_000) {
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
