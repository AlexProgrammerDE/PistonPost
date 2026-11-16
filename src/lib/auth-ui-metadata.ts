import { viewPaths } from "@better-auth-ui/core"

import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin"
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin"

const emailOtpViewPaths = emailOtpPlugin().viewPaths.auth
const twoFactorViewPaths = twoFactorPlugin().viewPaths.auth

export const validAuthPathSegments = new Set([
  ...Object.values(viewPaths.auth),
  ...Object.values(emailOtpViewPaths),
  ...Object.values(twoFactorViewPaths),
])

// Each label names the page title and heading, so it matches the visible view.
const authViewLabels = new Map([
  [viewPaths.auth.callback, "Finishing sign-in"],
  [viewPaths.auth.error, "Sign-in problem"],
  [viewPaths.auth.redirect, "Redirecting"],
  [viewPaths.auth.signIn, "Sign in"],
  [viewPaths.auth.signUp, "Sign up"],
  [viewPaths.auth.forgotPassword, "Forgot password"],
  [viewPaths.auth.resetPassword, "Reset password"],
  [viewPaths.auth.resetLinkSent, "Check your email"],
  [viewPaths.auth.signOut, "Sign out"],
  [viewPaths.auth.verifyEmail, "Verify email"],
  [emailOtpViewPaths.emailOtp, "Email me a sign-in code"],
  [twoFactorViewPaths.twoFactor, "Two-factor verification"],
])

export function getAuthViewLabel(value: string) {
  return authViewLabels.get(value) ?? "Account access"
}
