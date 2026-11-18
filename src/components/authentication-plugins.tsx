import { captchaPlugin } from "@better-auth-ui/react/plugins/captcha"
import { useTheme } from "next-themes"

import { TurnstileWidget } from "@/components/turnstile-widget"
import { adminPlugin } from "@/lib/auth/admin-plugin"
import { dashPlugin } from "@/lib/auth/dash-plugin"
import { deleteUserPlugin } from "@/lib/auth/delete-user-plugin"
import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin"
import { lastLoginMethodPlugin } from "@/lib/auth/last-login-method-plugin.ts"
import { multiSessionPlugin } from "@/lib/auth/multi-session-plugin"
import { passkeyPlugin } from "@/lib/auth/passkey-plugin"
import { themePlugin } from "@/lib/auth/theme-plugin"
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin"
import { usernamePlugin } from "@/lib/auth/username-plugin"

export function createAuthenticationPlugins(turnstileSiteKey?: string) {
  return [
    usernamePlugin({
      isUsernameAvailable: true,
      minUsernameLength: 1,
      maxUsernameLength: 32,
      usernamePrefix: "@",
      localization: { usernamePlaceholder: "your-name" },
    }),
    emailOtpPlugin({
      emailVerification: true,
      passwordReset: true,
      changeEmail: true,
      verifyCurrentEmail: true,
      localization: { emailOtp: "email code" },
    }),
    multiSessionPlugin({
      localization: { switchAccount: "Switch account", addAccount: "Add account" },
    }),
    adminPlugin(),
    dashPlugin({ organization: false }),
    passkeyPlugin(),
    twoFactorPlugin({ localization: { twoFactor: "Two-factor authentication" } }),
    deleteUserPlugin({ sendDeleteAccountVerification: true }),
    themePlugin({ useTheme }),
    ...(turnstileSiteKey
      ? [
          captchaPlugin({
            render: (props) => <TurnstileWidget {...props} siteKey={turnstileSiteKey} />,
          }),
        ]
      : []),
    lastLoginMethodPlugin(),
  ]
}
