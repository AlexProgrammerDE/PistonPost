export function requireEmailBinding(env: { readonly EMAIL?: SendEmail }): SendEmail {
  if (!env.EMAIL) throw new Error("Email delivery is not configured for this environment.")
  return env.EMAIL
}
