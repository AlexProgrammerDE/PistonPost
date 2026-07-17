import { dashClient, sentinelClient } from "@better-auth/infra/client"
import { passkeyClient } from "@better-auth/passkey/client"
import {
  adminClient,
  emailOTPClient,
  lastLoginMethodClient,
  magicLinkClient,
  multiSessionClient,
  twoFactorClient,
  usernameClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

const sentinelIdentifyUrl = import.meta.env.VITE_PUBLIC_BETTER_AUTH_IDENTIFY_URL?.trim()

export function createPistonPostAuthClient(baseURL?: string) {
  return createAuthClient({
    baseURL,
    basePath: "/api/auth",
    plugins: [
      usernameClient(),
      magicLinkClient(),
      emailOTPClient(),
      twoFactorClient(),
      passkeyClient(),
      adminClient(),
      multiSessionClient(),
      lastLoginMethodClient(),
      dashClient(),
      sentinelClient(sentinelIdentifyUrl ? { identifyUrl: sentinelIdentifyUrl } : undefined),
    ],
  })
}

export const authClient = createPistonPostAuthClient()
