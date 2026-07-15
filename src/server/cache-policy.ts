export const PUBLIC_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400"
export const PRIVATE_CACHE_CONTROL = "private, no-store, max-age=0, must-revalidate"

const PUBLIC_DOCUMENT_PATH = /^\/(?:post|tag|user)\/[^/]+\/?$/

function isReadRequest(request: Request) {
  return request.method === "GET" || request.method === "HEAD"
}

function isPublicDocumentPath(pathname: string) {
  return pathname === "/" || PUBLIC_DOCUMENT_PATH.test(pathname)
}

function isAnonymousRequest(request: Request) {
  return !request.headers.has("authorization") && !request.headers.has("cookie")
}

function hasExplicitCachePolicy(response: Response) {
  return (
    response.headers.has("Cache-Control") ||
    response.headers.has("CDN-Cache-Control") ||
    response.headers.has("Cloudflare-CDN-Cache-Control")
  )
}

function appendVary(headers: Headers, value: string) {
  const values = new Set(
    (headers.get("Vary") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  values.add(value)
  headers.set("Vary", [...values].join(", "))
}

function cloneResponse(response: Response, headers: Headers) {
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export function applyResponseCachePolicy(request: Request, response: Response) {
  const headers = new Headers(response.headers)
  const pathname = new URL(request.url).pathname

  if (isPublicDocumentPath(pathname)) {
    appendVary(headers, "Cookie")
    appendVary(headers, "Authorization")
  }

  if (hasExplicitCachePolicy(response)) {
    return cloneResponse(response, headers)
  }

  const canUsePublicCache =
    response.status === 200 &&
    !response.headers.has("Set-Cookie") &&
    isReadRequest(request) &&
    isAnonymousRequest(request) &&
    isPublicDocumentPath(pathname)

  headers.set("Cache-Control", canUsePublicCache ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL)
  return cloneResponse(response, headers)
}
