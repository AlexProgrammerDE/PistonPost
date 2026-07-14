import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"

import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"

export async function requireRequestSession(context: AppRequestContext) {
  const auth = await createRequestAuth(context)
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error("Authentication is required.")
  return session
}

export async function requireAdministrator(context: AppRequestContext) {
  const session = await requireRequestSession(context)
  const currentUser = await createD1Database(context.env.DB)
    .select({ role: schema.user.role, banned: schema.user.banned })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .get()
  if (!isActiveAdministrator(currentUser)) throw new Error("Administrator access is required.")
  return session
}

export function isActiveAdministrator(
  user: { role: string | null; banned: boolean | null } | undefined,
) {
  return user?.role === "admin" && user.banned !== true
}

export function assertMutationOrigin(context: AppRequestContext) {
  const headers = getRequestHeaders()
  const origin = headers.get("origin")
  const expected = new URL(context.runtime.config.PUBLIC_APP_URL).origin
  if (origin && origin !== expected) throw new Error("The request origin was rejected.")
}
