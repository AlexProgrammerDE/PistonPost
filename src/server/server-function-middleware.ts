import { isNotFound, isRedirect } from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import {
  serverFunctionErrorSchema,
  serverFunctionErrorStatus,
  toServerFunctionClientError,
} from "@/lib/server-function-error"
import { findRequestSession, isActiveAdministrator } from "@/server/request-session"
import {
  forbiddenFailure,
  normalizeServerFunctionFailure,
  unauthenticatedFailure,
} from "@/server/server-function-failure"

function getFailureName(cause: unknown) {
  if (cause instanceof Error) return cause.name
  if (typeof cause === "object" && cause !== null) return cause.constructor.name
  return typeof cause
}

export const serverFunctionErrorMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    try {
      return await next()
    } catch (cause) {
      const error = toServerFunctionClientError(cause)
      throw error ?? cause
    }
  })
  .server(async ({ next, serverFnMeta }) => {
    try {
      return await next()
    } catch (cause) {
      if (cause instanceof Response || isRedirect(cause) || isNotFound(cause)) throw cause
      const failure = normalizeServerFunctionFailure(cause)
      const error = serverFunctionErrorSchema.parse(failure.error)
      setResponseStatus(serverFunctionErrorStatus(error))
      if (error.code === "RATE_LIMITED") {
        setResponseHeader("Retry-After", error.retryAfterSeconds.toString())
      }
      if (error.code === "INTERNAL_ERROR") {
        console.error(
          JSON.stringify({
            level: "error",
            event: "server-function.failed",
            functionId: serverFnMeta.id,
            functionName: serverFnMeta.name,
            requestId: error.requestId,
            error: getFailureName(failure.cause),
          }),
        )
      }
      throw error
    }
  })

export const authenticatedServerFunctionMiddleware = createMiddleware({ type: "function" }).server(
  async ({ context, next }) => {
    const session = await findRequestSession(context)
    if (!session) throw unauthenticatedFailure()
    return next({
      context: {
        database: createD1Database(context.env.DB),
        session,
      },
    })
  },
)

export const administratorServerFunctionMiddleware = createMiddleware({ type: "function" })
  .middleware([authenticatedServerFunctionMiddleware])
  .server(async ({ context, next }) => {
    const currentUser = await context.database
      .select({ role: schema.user.role, banned: schema.user.banned })
      .from(schema.user)
      .where(eq(schema.user.id, context.session.user.id))
      .get()
    if (!isActiveAdministrator(currentUser))
      throw forbiddenFailure("Administrator access is required.")
    return next()
  })
