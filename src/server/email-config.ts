import { z } from "zod"

const unsubscribeKeyringSchema = z.object({
  current: z.string().min(32).max(4096),
  previous: z.array(z.string().min(32).max(4096)).max(2).default([]),
})

export async function readUnsubscribeKeyring(binding: string | SecretsStoreSecret) {
  const value = (typeof binding === "string" ? binding : await binding.get()).trim()
  if (!value) throw new Error("Email configuration EMAIL_UNSUBSCRIBE_SECRET is unavailable.")
  if (!value.startsWith("{")) {
    if (value.length < 32)
      throw new Error("EMAIL_UNSUBSCRIBE_SECRET must be at least 32 characters.")
    return { current: value, verificationKeys: [value] } as const
  }

  const parsed = unsubscribeKeyringSchema.parse(JSON.parse(value))
  const verificationKeys: [string, ...string[]] = [
    parsed.current,
    ...new Set(parsed.previous.filter((key) => key !== parsed.current)),
  ]
  return {
    current: parsed.current,
    verificationKeys,
  } as const
}
