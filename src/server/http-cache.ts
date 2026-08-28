function matchesEntityTag(value: string, entityTag: string) {
  return value.split(",").some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//u, "")
    return normalized === "*" || normalized === entityTag
  })
}

export function requestValidatorsMatch(request: Request, entityTag: string, lastModified: Date) {
  const ifNoneMatch = request.headers.get("if-none-match")
  if (ifNoneMatch !== null) return matchesEntityTag(ifNoneMatch, entityTag)

  const ifModifiedSince = request.headers.get("if-modified-since")
  if (ifModifiedSince === null) return false
  const modifiedSince = Date.parse(ifModifiedSince)
  if (!Number.isFinite(modifiedSince)) return false

  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(modifiedSince / 1000)
}
