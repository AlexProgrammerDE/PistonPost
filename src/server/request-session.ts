import { getRequestHeaders } from "@tanstack/react-start/server"

import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"

export async function findRequestSession(context: AppRequestContext) {
  const headers = getRequestHeaders()
  if (!headers.has("cookie")) return null

  const auth = await createRequestAuth(context)
  return auth.api.getSession({ headers })
}

export function isActiveAdministrator(
  user: { role: string | null; banned: boolean | null } | undefined,
) {
  return user?.role === "admin" && user.banned !== true
}
