const exactRedirects = new Map([
  ["/account/post", "/account/posts/new"],
  ["/account/post/", "/account/posts/new"],
  ["/tos", "/terms"],
  ["/tos/", "/terms"],
])

function canonicalPath(pathname: string) {
  return exactRedirects.get(pathname) ?? null
}

export function permanentRedirect(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") return null

  const url = new URL(request.url)
  const pathname = canonicalPath(url.pathname)
  if (!pathname) return null

  url.pathname = pathname
  return new Response(null, {
    headers: { Location: url.toString() },
    status: 308,
  })
}
