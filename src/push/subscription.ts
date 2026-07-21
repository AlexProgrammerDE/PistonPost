import { z } from "zod"

const base64UrlSchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/)

const trustedPushHostnames = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
])

function hasTrustedSuffix(hostname: string, suffix: string) {
  return hostname.endsWith(`.${suffix}`)
}

export function isTrustedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    const hostname = url.hostname.toLocaleLowerCase("en-US")
    return (
      url.protocol === "https:" &&
      (url.port === "" || url.port === "443") &&
      url.username === "" &&
      url.password === "" &&
      (trustedPushHostnames.has(hostname) ||
        hasTrustedSuffix(hostname, "push.apple.com") ||
        hasTrustedSuffix(hostname, "notify.windows.com"))
    )
  } catch {
    return false
  }
}

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().trim().min(1).max(2048).refine(isTrustedPushEndpoint),
  expirationTime: z.number().int().positive().nullable(),
  keys: z.object({
    p256dh: base64UrlSchema.max(512),
    auth: base64UrlSchema.max(256),
  }),
})

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>

export async function hashPushEndpoint(endpoint: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
