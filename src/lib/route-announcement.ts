/** The page content wrapper that receives focus after client-side navigation. */
export const MAIN_CONTENT_ID = "main-content"

/**
 * Chooses the text a screen reader hears after a client-side page change. The document
 * title names every page, so it comes first. The first heading covers pages whose title
 * has not been set yet.
 */
export function routeAnnouncement(title: string, heading: string | null | undefined) {
  const trimmedTitle = title.trim()
  if (trimmedTitle) return trimmedTitle

  const trimmedHeading = heading?.trim()
  if (trimmedHeading) return trimmedHeading

  return "New page"
}

/**
 * Decides whether focus moves to the page content after a client-side page change.
 *
 * Focus stays where it is when only the search or hash changed, when the new address
 * targets a fragment, or when focus already sits inside the page content. The last case
 * covers controls that autofocus on the new page and layouts whose own navigation stays
 * mounted inside the content area.
 */
export function shouldMoveFocusAfterNavigation({
  pathChanged,
  hash,
  focusInsideContent,
}: {
  pathChanged: boolean
  hash: string
  focusInsideContent: boolean
}) {
  return pathChanged && hash === "" && !focusInsideContent
}
