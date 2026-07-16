export const authViewPaths = {
  signIn: "sign-in",
  signUp: "sign-up",
  forgotPassword: "forgot-password",
  resetPassword: "reset-password",
  signOut: "sign-out",
  verifyEmail: "verify-email",
  magicLink: "magic-link",
} as const

export type AuthViewPath = (typeof authViewPaths)[keyof typeof authViewPaths]

const authViewLabels = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  "forgot-password": "Reset password",
  "reset-password": "Reset password",
  "sign-out": "Sign out",
  "verify-email": "Verify email",
  "magic-link": "Email me a sign-in link",
} satisfies Record<AuthViewPath, string>

export const authSettingsViewPaths = {
  account: "account",
  security: "security",
} as const

export function isAuthViewPath(value: string): value is AuthViewPath {
  return Object.values(authViewPaths).some((path) => path === value)
}

export function getAuthViewLabel(value: string) {
  return isAuthViewPath(value) ? authViewLabels[value] : "Account access"
}
