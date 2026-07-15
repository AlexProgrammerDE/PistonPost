import { createAuthPlugin } from "@better-auth-ui/core"

import { TwoFactorCard } from "@/components/auth/two-factor-card"

export const twoFactorPlugin = createAuthPlugin("two-factor", () => ({
  securityCards: [TwoFactorCard],
}))
