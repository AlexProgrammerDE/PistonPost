import { createServerFn } from "@tanstack/react-start"

export const getPublicRuntimeConfig = createServerFn({ method: "GET" }).handler(({ context }) => ({
  turnstileSiteKey: context.env.TURNSTILE_SITE_KEY,
  vapidPublicKey: context.env.VAPID_PUBLIC_KEY.trim() || null,
  // Account activity comes from the hosted Better Auth service through the Dash plugin.
  accountActivity: context.runtime.config.BETTER_AUTH_INFRA === "enabled",
}))
