import { createAuthPlugin } from "@better-auth-ui/core"

import { UsernameButton } from "@/components/auth/username-button"
import { UsernameSignIn } from "@/components/auth/username-sign-in"

export const usernamePlugin = createAuthPlugin("username", () => ({
  viewPaths: { auth: { username: "username" } },
  authButtons: [UsernameButton],
  views: { auth: { username: UsernameSignIn } },
}))
