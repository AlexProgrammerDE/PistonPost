import { viewPaths } from "@better-auth-ui/core"

import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin"

const magicLinkViewPaths = magicLinkPlugin().viewPaths.auth

export const validAuthPathSegments = new Set([
  ...Object.values(viewPaths.auth),
  ...Object.values(magicLinkViewPaths),
])

const authViewLabels = new Map([
  [viewPaths.auth.signIn, "Sign in"],
  [viewPaths.auth.signUp, "Create account"],
  [viewPaths.auth.forgotPassword, "Reset password"],
  [viewPaths.auth.resetPassword, "Reset password"],
  [viewPaths.auth.resetLinkSent, "Check your email"],
  [viewPaths.auth.signOut, "Sign out"],
  [viewPaths.auth.verifyEmail, "Verify email"],
  [magicLinkViewPaths.magicLink, "Email me a sign-in link"],
  [magicLinkViewPaths.magicLinkSent, "Check your email"],
])

export function getAuthViewLabel(value: string) {
  return authViewLabels.get(value) ?? "Account access"
}
