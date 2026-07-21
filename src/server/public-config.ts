import { createServerFn } from "@tanstack/react-start"

export const getPublicRuntimeConfig = createServerFn({ method: "GET" }).handler(
  async ({ context }) => ({
    turnstileSiteKey: context.env.TURNSTILE_SITE_KEY,
    vapidPublicKey: context.env.VAPID_PUBLIC_KEY.trim() || null,
  }),
)
