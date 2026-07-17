import { z } from "zod"

const LOCAL_REDIRECT_BASE_URL = new URL("https://pistonpost.invalid")
const MAX_LOCAL_REDIRECT_LENGTH = 2048

export function safeLocalRedirect(value: unknown) {
  if (typeof value !== "string") return undefined

  const candidate = value.trim()
  if (
    candidate.length === 0 ||
    candidate.length > MAX_LOCAL_REDIRECT_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return undefined
  }

  try {
    const destination = new URL(candidate, LOCAL_REDIRECT_BASE_URL)
    if (destination.origin !== LOCAL_REDIRECT_BASE_URL.origin) return undefined
    if (destination.pathname === "/auth" || destination.pathname.startsWith("/auth/")) {
      return undefined
    }

    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return undefined
  }
}

export const authSearchSchema = z.object({
  redirectTo: z.unknown().optional().transform(safeLocalRedirect),
})
