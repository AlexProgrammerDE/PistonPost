import handler from "@tanstack/react-start/server-entry"

import { allowRequest, routeClass } from "./request-rate-limit"
import { applyResponseCachePolicy } from "./server/cache-policy"
import { handleQueue } from "./server/email-queue"
import { handleScheduled } from "./server/maintenance"
import { writeOperationalEvent } from "./server/operational-events"
import { permanentRedirect } from "./server/permanent-redirects"
import { applySecurityHeaders, validateRequestSecurity } from "./server/request-security"
import { resolveRuntimeEnv, type RuntimeEnv } from "./server/runtime-env"
import { missingStaticAssetResponse } from "./server/static-assets"

export { AccountDeletionWorkflow } from "./server/account-deletion-workflow"

export type AppRequestContext = {
  readonly env: Cloudflare.Env
  readonly executionContext: ExecutionContext
  readonly runtime: RuntimeEnv
}

declare module "@tanstack/react-router" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
  interface Register {
    server: {
      requestContext: AppRequestContext
    }
  }
}

function healthResponse() {
  return Response.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  )
}

function rateLimitResponse() {
  return Response.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded. Please try again soon.",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": "60",
      },
      status: 429,
    },
  )
}

export function createWorkerFetch(handlerFetch: typeof handler.fetch) {
  return async (request: Request, env: Cloudflare.Env, ctx: ExecutionContext) => {
    const url = new URL(request.url)
    const runtime = resolveRuntimeEnv(env)
    const startedAt = performance.now()
    const secure = (response: Response) =>
      applySecurityHeaders(request, response, runtime.config.APP_ENV === "production")
    if (request.method === "GET" && url.pathname === "/health") {
      return secure(healthResponse())
    }

    const redirect = permanentRedirect(request)
    if (redirect) return secure(redirect)

    const rejected = validateRequestSecurity(request, new URL(runtime.config.PUBLIC_APP_URL).origin)
    if (rejected) {
      writeOperationalEvent(
        env,
        "request.rejected",
        [request.method, routeClass(url.pathname)],
        [rejected.status],
      )
      return secure(rejected)
    }

    // Existing assets bypass the Worker. Reaching this branch means the active
    // deployment does not contain the requested fingerprinted file.
    const missingAsset = missingStaticAssetResponse(request)
    if (missingAsset) {
      writeOperationalEvent(
        env,
        "request.completed",
        [request.method, "asset-miss"],
        [missingAsset.status, performance.now() - startedAt],
      )
      return secure(missingAsset)
    }

    if (!(await allowRequest(request, env))) {
      return secure(rateLimitResponse())
    }

    const response = await handlerFetch(request, {
      context: { env, executionContext: ctx, runtime },
    })

    const cachedResponse = applyResponseCachePolicy(request, response)
    writeOperationalEvent(
      env,
      "request.completed",
      [request.method, routeClass(url.pathname)],
      [response.status, performance.now() - startedAt],
    )
    return secure(cachedResponse)
  }
}

const workerFetch = createWorkerFetch(handler.fetch)

export default {
  fetch: workerFetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Cloudflare.Env>
