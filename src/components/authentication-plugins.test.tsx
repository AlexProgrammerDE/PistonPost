import { describe, expect, test } from "bun:test"

import { defaultAuthLocale, localizeAuthPlugins } from "@better-auth-ui/core"
import { adminPlugin as coreAdminPlugin } from "@better-auth-ui/core/plugins/admin"
import { dashPlugin as coreDashPlugin } from "@better-auth-ui/core/plugins/dash"
import { emailOtpPlugin as coreEmailOtpPlugin } from "@better-auth-ui/core/plugins/email-otp"
import { multiSessionPlugin as coreMultiSessionPlugin } from "@better-auth-ui/core/plugins/multi-session"
import { themePlugin as coreThemePlugin } from "@better-auth-ui/core/plugins/theme"
import { twoFactorPlugin as coreTwoFactorPlugin } from "@better-auth-ui/core/plugins/two-factor"
import { captchaPlugin } from "@better-auth-ui/react/plugins/captcha"

import { StopImpersonating } from "@/components/auth/admin/stop-impersonating"
import { UserActivity } from "@/components/auth/dash/activity"
import { ChangeEmailOtp } from "@/components/auth/email-otp/change-email-otp"
import { EmailOtp } from "@/components/auth/email-otp/email-otp"
import { ForgotPasswordOtp } from "@/components/auth/email-otp/forgot-password-otp"
import { ResetPasswordOtp } from "@/components/auth/email-otp/reset-password-otp"
import { VerifyEmailOtp } from "@/components/auth/email-otp/verify-email-otp"
import { ManageAccounts } from "@/components/auth/multi-session/manage-accounts"
import { SwitchAccountSubmenu } from "@/components/auth/multi-session/switch-account-submenu"
import { Appearance } from "@/components/auth/theme/appearance"
import { ThemeToggleItem } from "@/components/auth/theme/theme-toggle-item"
import { TwoFactorChallenge } from "@/components/auth/two-factor/two-factor-challenge"
import { TwoFactorSettings } from "@/components/auth/two-factor/two-factor-settings"
import { SignInUsername } from "@/components/auth/username/sign-in-username"
import { UsernameField } from "@/components/auth/username/username-field"
import { usernamePlugin } from "@/lib/auth/username-plugin"

import { createAuthenticationPlugins } from "./authentication-plugins"

describe("global authentication plugins", () => {
  test("contributes account switching, impersonation, and theme controls", () => {
    const plugins = createAuthenticationPlugins()
    const admin = plugins.find((plugin) => plugin.id === coreAdminPlugin.id)
    const multiSession = plugins.find((plugin) => plugin.id === coreMultiSessionPlugin.id)
    const theme = plugins.find((plugin) => plugin.id === coreThemePlugin.id)

    expect(admin?.userMenuItems).toEqual([StopImpersonating])
    expect(multiSession?.userMenuItems).toEqual([SwitchAccountSubmenu])
    expect(multiSession?.accountCards).toEqual([ManageAccounts])
    expect(theme?.userMenuItems).toEqual([ThemeToggleItem])
    expect(theme?.accountCards).toEqual([Appearance])
  })

  test("adds personal Dash activity without organization surfaces", () => {
    const dash = createAuthenticationPlugins().find((plugin) => plugin.id === coreDashPlugin.id)

    expect(dash?.settingsTabs).toHaveLength(1)
    expect(dash?.settingsTabs?.[0]).toMatchObject({
      view: "activity",
      component: UserActivity,
    })
    expect(dash?.organizationTabs).toBeUndefined()
  })

  test("registers captcha UI only when Turnstile is configured", () => {
    const withoutTurnstile = createAuthenticationPlugins()
    const withTurnstile = createAuthenticationPlugins("site-key")

    expect(withoutTurnstile.some((plugin) => plugin.id === captchaPlugin.id)).toBe(false)
    expect(withTurnstile.some((plugin) => plugin.id === captchaPlugin.id)).toBe(true)
  })

  test("registers email OTP and two-factor flows with matching views", () => {
    const plugins = createAuthenticationPlugins()
    const emailOtp = plugins.find((plugin) => plugin.id === coreEmailOtpPlugin.id)
    const twoFactor = plugins.find((plugin) => plugin.id === coreTwoFactorPlugin.id)

    expect(emailOtp?.views.auth).toMatchObject({
      emailOtp: EmailOtp,
      verifyEmail: VerifyEmailOtp,
      forgotPassword: ForgotPasswordOtp,
      resetPassword: ResetPasswordOtp,
    })
    // The server sends change-email codes and checks the current address first.
    expect(emailOtp?.cardOverrides?.account).toEqual({ changeEmail: ChangeEmailOtp })
    expect(emailOtp).toMatchObject({ changeEmail: true, verifyCurrentEmail: true })
    expect(twoFactor?.views.auth).toEqual({ twoFactor: TwoFactorChallenge })
    expect(twoFactor?.securityCards).toEqual([TwoFactorSettings])
  })

  test("labels the sign-in identifier for both usernames and emails", () => {
    const username = localizeAuthPlugins(createAuthenticationPlugins(), defaultAuthLocale).find(
      (plugin) => plugin.id === usernamePlugin.id,
    )

    // The provider resolves localization before rendering, so check the resolved plugin.
    expect(username?.views?.auth).toEqual({ signIn: SignInUsername })
    expect(username?.localization).toMatchObject({
      username: "Username or email",
      usernameOrEmailPlaceholder: "your-name or you@example.com",
    })
    expect(username?.additionalFields).toEqual([
      expect.objectContaining({
        name: "username",
        label: "Username",
        placeholder: "your-name",
        render: UsernameField,
      }),
    ])
  })
})
