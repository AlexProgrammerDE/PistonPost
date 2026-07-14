export function requireEmailBinding(env: Pick<Cloudflare.Env, "EMAIL">): SendEmail {
  if (!env.EMAIL) throw new Error("Email delivery is not configured for this environment.")
  return env.EMAIL
}
