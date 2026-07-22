import handler from "@tanstack/react-start/server-entry"
import { Effect } from "effect"

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
  interface Register {
    server: {
      requestContext: AppRequestContext
    }
  }
}

function healthResponse() {
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}

function rateLimitResponse() {
  return new Response(
    JSON.stringify({
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded. Please try again soon.",
      },
    }),
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

function anonymousRateLimitKey(request: Request) {
  const pathname = new URL(request.url).pathname
  const address = request.headers.get("cf-connecting-ip") ?? "local"
  return `${address}:${pathname}`
}

function authRateLimitKey(request: Request) {
  const address = request.headers.get("cf-connecting-ip") ?? "local"
  return `auth:${address}`
}

function isAnonymous(request: Request) {
  return !request.headers.has("authorization") && !request.headers.has("cookie")
}

function checkAnonymousRateLimit(request: Request, limiter: RateLimit) {
  return Effect.tryPromise({
    try: () => limiter.limit({ key: anonymousRateLimitKey(request) }),
    catch: () => undefined,
  }).pipe(
    Effect.map((result) => result.success),
    Effect.catchAll(() => Effect.succeed(true)),
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
        [request.method, url.pathname],
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

    if (url.pathname.startsWith("/api/auth/")) {
      const result = await env.AUTH_RATE_LIMITER.limit({ key: authRateLimitKey(request) })
      if (!result.success) {
        return secure(rateLimitResponse())
      }
    }

    if (isAnonymous(request)) {
      const allowed = await Effect.runPromise(
        checkAnonymousRateLimit(request, env.ANON_RATE_LIMITER),
      )
      if (!allowed) {
        return secure(rateLimitResponse())
      }
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

function routeClass(pathname: string) {
  if (pathname === "/") return "feed"
  if (pathname.startsWith("/post/")) return "post"
  if (pathname.startsWith("/api/auth/")) return "auth"
  if (pathname.startsWith("/media/")) return "media"
  if (pathname.startsWith("/admin/")) return "admin"
  if (pathname.startsWith("/_serverFn/")) return "server-function"
  return "other"
}

const workerFetch = createWorkerFetch(handler.fetch)

export default {
  fetch: workerFetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Cloudflare.Env>
