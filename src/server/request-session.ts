import { getRequestHeaders } from "@tanstack/react-start/server"

import { isBannedUser } from "@/db/account-ban"
import type { Actor } from "@/domain/model"
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

/**
 * The policy actor for a session user. A banned account acts as an anonymous viewer, and only an
 * active administrator carries the admin role.
 */
export function requestActor(
  user:
    | {
        readonly id: string
        readonly role?: string | null
        readonly banned?: boolean | null
        readonly banExpires?: Date | null
      }
    | null
    | undefined,
  now = new Date(),
): Actor {
  if (!user || isBannedUser(user, now)) return { kind: "anonymous" }
  return {
    kind: "authenticated",
    userId: user.id,
    roles: isActiveAdministrator(user, now) ? ["admin"] : [],
  }
}
