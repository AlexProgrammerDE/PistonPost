import { safeLocalRedirect } from "@/lib/local-redirect"

const URL_BASE = "https://pistonpost.invalid"

/** Auth views that finish by sending someone back, so a link into them should say where to. */
const RETURNING_AUTH_PATHS = new Set([
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/email-otp",
  "/auth/magic-link",
  "/auth/two-factor",
])

type CurrentLocation = { readonly pathname: string; readonly searchStr: string }

function currentReturnPath(current: CurrentLocation) {
  if (current.pathname === "/auth" || current.pathname.startsWith("/auth/")) {
    // Moving between auth views, such as sign-in to sign-up, keeps the original destination.
    return safeLocalRedirect(new URLSearchParams(current.searchStr).get("redirectTo"))
  }
  return safeLocalRedirect(`${current.pathname}${current.searchStr}`)
}

/**
 * Adds the page someone came from as `redirectTo` to a link into a sign-in view, unless the link
 * already has one. The upstream auth components build these links without it, so signing in from
 * the account menu or switching to sign-up would otherwise end on the home feed.
 */
export function withAuthReturnRedirect(target: string, current: CurrentLocation) {
  if (!target.startsWith("/")) return target
  const url = new URL(target, URL_BASE)
  if (!RETURNING_AUTH_PATHS.has(url.pathname) || url.searchParams.has("redirectTo")) return target

  const returnPath = currentReturnPath(current)
  if (!returnPath || returnPath === "/") return target

  url.searchParams.set("redirectTo", returnPath)
  return `${url.pathname}${url.search}${url.hash}`
}
