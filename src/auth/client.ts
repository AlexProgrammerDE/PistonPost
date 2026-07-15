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
    ],
  })
}

export const authClient = createPistonPostAuthClient()
