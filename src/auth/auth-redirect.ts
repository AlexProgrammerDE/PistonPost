import { getSafeRedirectTo, viewPaths } from "@better-auth-ui/core"

const AUTH_BASE_PATH = "/auth"

/**
 * Wrap a same-origin Better Auth callback in BAUI's authenticated redirect view.
 */
export function createAuthRedirectUrl(baseURL: string, callbackURL: string) {
  const base = new URL(baseURL)
  const callback = new URL(callbackURL, base)
  const redirectTo = getSafeRedirectTo(callbackURL, base.origin)

  if (
    callback.origin !== base.origin ||
    callback.username ||
    callback.password ||
    redirectTo !== `${callback.pathname}${callback.search}${callback.hash}`
  ) {
    throw new Error("Better Auth callback URLs must use the application origin.")
  }

  const redirect = new URL(`${AUTH_BASE_PATH}/${viewPaths.auth.redirect}`, base.origin)
  redirect.searchParams.set("redirectTo", redirectTo)
  return redirect.toString()
}
