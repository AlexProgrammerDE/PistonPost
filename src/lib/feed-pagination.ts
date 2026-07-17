export function feedPageHref(path: string, cursor: string | undefined) {
  if (!cursor) return path
  const search = new URLSearchParams({ cursor })
  return `${path}?${search.toString()}`
}
