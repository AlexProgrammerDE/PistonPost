import { describe, expect, test } from "bun:test"

import {
  adminPlugin as coreAdminPlugin,
  multiSessionPlugin as coreMultiSessionPlugin,
  themePlugin as coreThemePlugin,
} from "@better-auth-ui/core/plugins"
import { captchaPlugin } from "@better-auth-ui/react/plugins"

import { StopImpersonating } from "@/components/auth/admin/stop-impersonating"
import { ManageAccounts } from "@/components/auth/multi-session/manage-accounts"
import { SwitchAccountSubmenu } from "@/components/auth/multi-session/switch-account-submenu"
import { Appearance } from "@/components/auth/theme/appearance"
import { ThemeToggleItem } from "@/components/auth/theme/theme-toggle-item"

import { createAuthenticationPlugins } from "./providers"

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

  test("registers captcha UI only when Turnstile is configured", () => {
    const withoutTurnstile = createAuthenticationPlugins()
    const withTurnstile = createAuthenticationPlugins("site-key")

    expect(withoutTurnstile.some((plugin) => plugin.id === captchaPlugin.id)).toBe(false)
    expect(withTurnstile.some((plugin) => plugin.id === captchaPlugin.id)).toBe(true)
  })
})
