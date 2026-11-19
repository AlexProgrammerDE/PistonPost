import { Effect } from "effect"

type RateLimitBindings = Pick<
  Cloudflare.Env,
  "ANON_RATE_LIMITER" | "AUTH_RATE_LIMITER" | "USER_RATE_LIMITER"
>

// Better Auth uses the "pistonpost" cookie prefix and adds __Secure- to secure cookies.
const sessionCookieNames = new Set([
  "pistonpost.session_token",
  "__Secure-pistonpost.session_token",
])

/** Groups paths into a few stable classes for rate-limit keys and analytics dimensions. */
export function routeClass(pathname: string) {
  if (pathname === "/") return "feed"
  if (pathname.startsWith("/post/")) return "post"
  if (pathname.startsWith("/api/auth/")) return "auth"
  if (pathname.startsWith("/media/")) return "media"
  if (pathname.startsWith("/admin/")) return "admin"
  if (pathname.startsWith("/_serverFn/")) return "server-function"
  return "other"
}

/**
 * Returns the credential that identifies a signed-in browser or API client. Other cookies, such as
 * the consent or sidebar cookie, do not make a request authenticated.
 */
export function requestCredential(request: Request) {
  const authorization = request.headers.get("authorization")?.trim()
  if (authorization) return `authorization:${authorization}`

  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (value && sessionCookieNames.has(name)) return `session:${value}`
  }
  return null
}

async function credentialKey(credential: string) {
  // Keep raw session tokens out of rate-limit keys.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(credential))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Asks a limiter for a slot. A binding failure allows the request instead of failing it. */
function allows(limiter: RateLimit, key: string) {
  return Effect.tryPromise({
    try: () => limiter.limit({ key }),
    catch: () => undefined,
  }).pipe(
    Effect.map((result) => result.success),
    Effect.orElseSucceed(() => true),
  )
}

function isSessionRead(request: Request, pathname: string) {
  return (
    (request.method === "GET" || request.method === "HEAD") && pathname === "/api/auth/get-session"
  )
}

/**
 * Applies the broad request limits. Returns false when the request should get a 429 response.
 *
 * - Auth endpoints share a strict per-address budget, except the session read every page makes.
 * - Signed-in traffic uses a per-credential budget, so people behind one address do not share it.
 * - Anonymous traffic and public media use a per-address budget for each route class.
 */
export async function allowRequest(request: Request, env: RateLimitBindings) {
  const { pathname } = new URL(request.url)
  const address = request.headers.get("cf-connecting-ip") ?? "local"
  const route = routeClass(pathname)

  if (
    route === "auth" &&
    !isSessionRead(request, pathname) &&
    !(await Effect.runPromise(allows(env.AUTH_RATE_LIMITER, `auth:${address}`)))
  ) {
    return false
  }

  const credential = route === "media" ? null : requestCredential(request)
  if (credential) {
    const key = `request:${route}:${await credentialKey(credential)}`
    return Effect.runPromise(allows(env.USER_RATE_LIMITER, key))
  }
  return Effect.runPromise(allows(env.ANON_RATE_LIMITER, `${address}:${route}`))
}
