import { Schema, Effect } from "effect"

const unsubscribeKeyringSchema = Schema.Struct({
  current: Schema.String.check(Schema.isMinLength(32)).check(Schema.isMaxLength(4096)),
  previous: Schema.mutable(
    Schema.Array(Schema.String.check(Schema.isMinLength(32)).check(Schema.isMaxLength(4096))),
  )
    .check(Schema.isMaxLength(2))
    .pipe(Schema.withDecodingDefaultType(Effect.sync(() => []))),
})

export async function readUnsubscribeKeyring(binding: string | SecretsStoreSecret) {
  const value = (typeof binding === "string" ? binding : await binding.get()).trim()
  if (!value) throw new Error("Email configuration EMAIL_UNSUBSCRIBE_SECRET is unavailable.")
  if (!value.startsWith("{")) {
    if (value.length < 32)
      throw new Error("EMAIL_UNSUBSCRIBE_SECRET must be at least 32 characters.")
    return { current: value, verificationKeys: [value] } as const
  }

  const parsed = Schema.decodeUnknownSync(unsubscribeKeyringSchema, { errors: "all" })(
    JSON.parse(value),
  )
  const verificationKeys: [string, ...string[]] = [
    parsed.current,
    ...new Set(parsed.previous.filter((key) => key !== parsed.current)),
  ]
  return {
    current: parsed.current,
    verificationKeys,
  } as const
}
