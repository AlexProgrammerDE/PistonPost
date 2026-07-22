const exactRedirects = new Map([
  ["/account/post", "/posts/new"],
  ["/account/post/", "/posts/new"],
  ["/tos", "/terms"],
  ["/tos/", "/terms"],
])

const prefixRedirects = [
  ["/account/posts", "/posts"],
  ["/account/settings", "/settings"],
] as const

function canonicalPath(pathname: string) {
  const exactPath = exactRedirects.get(pathname)
  if (exactPath) return exactPath

  for (const [legacyPrefix, canonicalPrefix] of prefixRedirects) {
    if (pathname === legacyPrefix || pathname === `${legacyPrefix}/`) return canonicalPrefix
    if (pathname.startsWith(`${legacyPrefix}/`)) {
      return `${canonicalPrefix}${pathname.slice(legacyPrefix.length)}`
    }
  }

  return null
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
