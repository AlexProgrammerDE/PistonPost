import { notFound, redirect } from "@tanstack/react-router"

import { serverFunctionErrorCode } from "@/lib/server-function-error"

/**
 * Turns a failed load of something the viewer must own into the route response: sign-in for a
 * signed-out visitor, and not found for a missing item or one owned by someone else, so the page
 * reveals nothing about other people's content. Other failures are returned unchanged.
 */
export function ownedRouteFailure(error: unknown, returnTo: string) {
  const code = serverFunctionErrorCode(error)
  if (code === "UNAUTHENTICATED") {
    return redirect({
      to: "/auth/$authView",
      params: { authView: "sign-in" },
      search: { redirectTo: returnTo },
    })
  }
  if (code === "NOT_FOUND" || code === "FORBIDDEN") return notFound()
  return error
}
