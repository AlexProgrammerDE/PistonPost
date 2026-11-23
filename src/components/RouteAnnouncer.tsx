import { useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import {
  MAIN_CONTENT_ID,
  routeAnnouncement,
  shouldMoveFocusAfterNavigation,
} from "@/lib/route-announcement"

/**
 * Announces client-side page changes and moves focus to the page content, as a full page
 * load would. The first render is a real page load, so it neither announces nor moves focus.
 */
export function RouteAnnouncer() {
  const router = useRouter()
  const [announcement, setAnnouncement] = useState("")

  useEffect(() => {
    let frame = 0

    // onRendered fires after React commits the new matches. With a view transition it runs
    // inside the transition's update callback, so the new page is already in the DOM.
    const unsubscribe = router.subscribe("onRendered", ({ pathChanged, toLocation }) => {
      if (!pathChanged) return

      const content = document.querySelector<HTMLElement>(`#${MAIN_CONTENT_ID}`)
      const active = document.activeElement
      const focusInsideContent =
        content !== null && active !== null && active !== content && content.contains(active)

      if (
        content &&
        shouldMoveFocusAfterNavigation({ pathChanged, hash: toLocation.hash, focusInsideContent })
      ) {
        // Scroll restoration owns the scroll position.
        content.focus({ preventScroll: true })
      }

      // Clear first so a repeated title is still announced. The head updates the title
      // after the route renders, so read it on the next frame.
      setAnnouncement("")
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const heading = content?.querySelector("h1")?.textContent
        setAnnouncement(routeAnnouncement(document.title, heading))
      })
    })

    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [router])

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </div>
  )
}
