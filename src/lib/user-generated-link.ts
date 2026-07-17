import { SITE_URL } from "./seo"

export const MAX_USER_GENERATED_URL_LENGTH = 2_048

export type UserGeneratedLinkRelationship = "me"

const siteUrl = new URL(SITE_URL)

export function safeUserGeneratedUrl(value: string) {
  if (!value || value.length > MAX_USER_GENERATED_URL_LENGTH) return ""

  try {
    const url = new URL(value, siteUrl)
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? value
      : ""
  } catch {
    return ""
  }
}

export function isExternalUserGeneratedUrl(value: string) {
  try {
    const url = new URL(value, siteUrl)
    return url.protocol === "mailto:" || url.origin !== siteUrl.origin
  } catch {
    return false
  }
}

export function safeExternalUserGeneratedUrl(value: string) {
  const safeUrl = safeUserGeneratedUrl(value)
  if (!safeUrl || !isExternalUserGeneratedUrl(safeUrl)) return null
  return new URL(safeUrl, siteUrl).toString()
}

export function externalLinkDestination(value: string) {
  try {
    const url = new URL(value, siteUrl)
    if (url.protocol === "mailto:") return "your email app"
    return url.hostname.replace(/^www\./u, "") || "another site"
  } catch {
    return "another site"
  }
}

export function externalLinkWarningPath(value: string) {
  const search = new URLSearchParams({ url: value })
  return `/external?${search.toString()}`
}

export function userGeneratedLinkRel(
  external: boolean,
  relationship?: UserGeneratedLinkRelationship,
) {
  return ["ugc", ...(external ? ["nofollow", "noopener", "noreferrer"] : []), relationship]
    .filter((value) => value !== undefined)
    .join(" ")
}
