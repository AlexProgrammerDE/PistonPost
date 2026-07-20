const BODY_METHODS = new Set(["POST", "PUT", "PATCH"])
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const MAX_DEFAULT_BODY_BYTES = 1024 * 1024
const MAX_IMAGE_BODY_BYTES = 15 * 1024 * 1024
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024

const allowedBodyTypes = new Set([
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
])
const allowedImageTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: { code: "INVALID_REQUEST", message } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  )
}

function bodyLimit(pathname: string) {
  if (pathname.startsWith("/media/upload/")) return MAX_IMAGE_BODY_BYTES
  if (pathname === "/api/stream/webhook") return MAX_WEBHOOK_BODY_BYTES
  return MAX_DEFAULT_BODY_BYTES
}

function mediaType(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US")
}

export function validateRequestSecurity(request: Request, expectedOrigin: string) {
  if (!MUTATION_METHODS.has(request.method)) return null
  const pathname = new URL(request.url).pathname
  const webhook = pathname === "/api/stream/webhook"

  if (!webhook) {
    const origin = request.headers.get("origin")
    if (origin !== expectedOrigin) return errorResponse("The request origin was rejected.", 403)
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      return errorResponse("Cross-site mutations are not accepted.", 403)
    }
  }

  if (!BODY_METHODS.has(request.method)) return null
  const declaredLength = request.headers.get("content-length")
  const length = declaredLength === null ? Number.NaN : Number(declaredLength)
  if (!Number.isSafeInteger(length) || length < 0) {
    return errorResponse("A valid Content-Length header is required.", 411)
  }
  if (length > bodyLimit(pathname)) return errorResponse("The request body is too large.", 413)
  if (length === 0) return null

  const type = mediaType(request)
  if (pathname.startsWith("/media/upload/")) {
    if (!type || !allowedImageTypes.has(type)) {
      return errorResponse("The upload content type is not supported.", 415)
    }
    return null
  }
  if (!type || !allowedBodyTypes.has(type)) {
    return errorResponse("The request content type is not supported.", 415)
  }
  return null
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://challenges.cloudflare.com https://kv.better-auth.com https://*.videodelivery.net https://*.cloudflarestream.com https://t.pistonmaster.net https://*.posthog.com",
  "font-src 'self' data: https://*.posthog.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://open.spotify.com",
  "img-src 'self' data: blob: https://*.posthog.com",
  "media-src 'self' blob: https://*.videodelivery.net https://*.cloudflarestream.com https://*.posthog.com",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://t.pistonmaster.net https://*.posthog.com",
  "style-src 'self' 'unsafe-inline' https://*.posthog.com",
  "worker-src 'self' blob:",
].join("; ")

export function applySecurityHeaders(request: Request, response: Response, production: boolean) {
  const headers = new Headers(response.headers)
  headers.set("Content-Security-Policy", contentSecurityPolicy)
  headers.set("Cross-Origin-Opener-Policy", "same-origin")
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=()")
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("X-Frame-Options", "DENY")
  if (production && new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
