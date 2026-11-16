import { getRequestHeaders } from "@tanstack/react-start/server"

import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"

/**
 * Read the session from D1 for this request. Better Auth runs without a
 * cookie cache, so `session.user.role` and `session.user.banned` are current.
 */
export async function findRequestSession(context: AppRequestContext) {
  const headers = getRequestHeaders()
  if (!headers.has("cookie")) return null

  const auth = await createRequestAuth(context)
  return auth.api.getSession({ headers, query: { disableCookieCache: true } })
}

/** Match the admin plugin: a ban with a past expiry no longer applies. */
export function isBannedUser(
  user: { banned?: boolean | null; banExpires?: Date | null },
  now = new Date(),
) {
  return user.banned === true && (!user.banExpires || user.banExpires.getTime() > now.getTime())
}

export function isActiveAdministrator(
  user: { role: string | null; banned: boolean | null } | undefined,
) {
  return user?.role === "admin" && user.banned !== true
}
