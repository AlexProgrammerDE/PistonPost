import { Schema } from "effect"

const base64UrlSchema = Schema.Trim.check(Schema.isMinLength(16))
  .check(Schema.isMaxLength(512))
  .check(Schema.isPattern(/^[A-Za-z0-9_-]+={0,2}$/))

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

export const pushSubscriptionInputSchema = Schema.Struct({
  endpoint: Schema.Trim.check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(2048))
    .check(Schema.makeFilter((value) => isTrustedPushEndpoint(value))),
  expirationTime: Schema.NullOr(Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThan(0))),
  keys: Schema.Struct({
    p256dh: base64UrlSchema.check(Schema.isMaxLength(512)),
    auth: base64UrlSchema.check(Schema.isMaxLength(256)),
  }),
})

export type PushSubscriptionInput = (typeof pushSubscriptionInputSchema)["Type"]

export async function hashPushEndpoint(endpoint: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
