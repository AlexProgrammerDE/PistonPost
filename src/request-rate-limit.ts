import { Effect } from "effect"

import { clientNetworkKey } from "@/server/client-network"

type RateLimitBindings = Pick<
  Cloudflare.Env,
  "ANON_RATE_LIMITER" | "AUTH_RATE_LIMITER" | "USER_RATE_LIMITER"
> & {
  readonly BETTER_AUTH_SECRET: string | SecretsStoreSecret
}

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

function tryDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Reads the session cookie values in header order, decoded as Better Auth reads them. */
function sessionCookieValues(request: Request) {
  const values: string[] = []
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (value && sessionCookieNames.has(name)) values.push(tryDecode(value))
  }
  return values
}

/** Reads a bearer token. Tokens without a signature are not checked here, so they are ignored. */
function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim()
  if (authorization?.slice(0, 7).toLowerCase() !== "bearer ") return null
  const token = authorization.slice(7).trim()
  return token.includes("%") ? tryDecode(token) : token
}

/**
 * Checks a `token.signature` value with the HMAC-SHA256 signature that Better Auth, through
 * better-call, puts on the session cookie. The signature is 44 characters of padded base64.
 */
async function verifiedToken(signedValue: string, key: CryptoKey) {
  const separator = signedValue.lastIndexOf(".")
  if (separator < 1) return null
  const token = signedValue.slice(0, separator)
  const signature = signedValue.slice(separator + 1)
  if (signature.length !== 44 || !signature.endsWith("=")) return null
  try {
    const bytes = Uint8Array.from(atob(signature), (char) => char.codePointAt(0) ?? 0)
    const valid = await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(token))
    return valid ? token : null
  } catch {
    return null
  }
}

/**
 * Returns the session token that identifies a signed-in browser or API client. Only a session
 * cookie or bearer token signed with the auth secret counts. Other cookies, such as the consent or
 * sidebar cookie, and forged or unsigned values do not make a request authenticated.
 *
 * The check does not read D1, so a correctly signed token for a revoked session still counts. An
 * attacker cannot mint signed tokens without signing in, and sign-in has its own address budget.
 */
export async function requestCredential(request: Request, secret: string) {
  const candidates = [bearerToken(request), ...sessionCookieValues(request)].filter(
    (value): value is string => Boolean(value),
  )
  if (candidates.length === 0) return null

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )
  for (const candidate of candidates) {
    const token = await verifiedToken(candidate, key)
    if (token) return `session:${token}`
  }
  return null
}

/** Reads the auth secret for this request. A missing secret leaves the request anonymous. */
async function readAuthSecret(secret: string | SecretsStoreSecret) {
  try {
    const value = (typeof secret === "string" ? secret : await secret.get()).trim()
    return value || null
  } catch {
    return null
  }
}

function hasCredentialCandidate(request: Request) {
  return bearerToken(request) !== null || sessionCookieValues(request).length > 0
}

async function verifiedCredential(request: Request, env: RateLimitBindings) {
  if (!hasCredentialCandidate(request)) return null
  const secret = await readAuthSecret(env.BETTER_AUTH_SECRET)
  return secret ? requestCredential(request, secret) : null
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
 * - Traffic with a correctly signed session token uses a per-session budget, so people behind one
 *   address do not share it. Forged, unsigned, or unverifiable credentials stay anonymous.
 * - Anonymous traffic and public media use a per-address budget for each route class.
 */
export async function allowRequest(request: Request, env: RateLimitBindings) {
  const { pathname } = new URL(request.url)
  // IPv6 clients share one budget per /64, so rotating addresses inside it gains nothing.
  const address = clientNetworkKey(request.headers.get("cf-connecting-ip") ?? "local")
  const route = routeClass(pathname)

  if (
    route === "auth" &&
    !isSessionRead(request, pathname) &&
    !(await Effect.runPromise(allows(env.AUTH_RATE_LIMITER, `auth:${address}`)))
  ) {
    return false
  }

  const credential = route === "media" ? null : await verifiedCredential(request, env)
  if (credential) {
    const key = `request:${route}:${await credentialKey(credential)}`
    return Effect.runPromise(allows(env.USER_RATE_LIMITER, key))
  }
  return Effect.runPromise(allows(env.ANON_RATE_LIMITER, `${address}:${route}`))
}
