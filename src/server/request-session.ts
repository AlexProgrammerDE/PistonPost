import { getRequestHeaders } from "@tanstack/react-start/server"

import { isBannedUser } from "@/db/account-ban"
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

export function isActiveAdministrator(
  user:
    | {
        readonly role?: string | null
        readonly banned?: boolean | null
        readonly banExpires?: Date | null
      }
    | undefined,
  now = new Date(),
) {
  return user?.role === "admin" && !isBannedUser(user, now)
}
