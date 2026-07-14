import type { AuthConfig } from "@better-auth-ui/core"
import { captchaPlugin } from "@better-auth-ui/react/plugins"
import { authClient } from "@pistonpost/auth/client"
import type { QueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useTheme } from "next-themes"
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react"

import { AuthProvider } from "@/components/auth/auth-provider"
import { TurnstileWidget } from "@/components/turnstile-widget"
import { deleteUserPlugin } from "@/lib/auth/delete-user-plugin"
import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin"
import { passkeyPlugin } from "@/lib/auth/passkey-plugin"
import { themePlugin } from "@/lib/auth/theme-plugin"
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin"
import { usernamePlugin } from "@/lib/auth/username-plugin"

function RouterLink({ href, ...props }: ComponentPropsWithoutRef<AuthConfig["Link"]>) {
  return <Link to={href} {...props} />
}

export function AuthenticationProvider({
  children,
  queryClient,
  turnstileSiteKey,
}: PropsWithChildren<{
  readonly queryClient: QueryClient
  readonly turnstileSiteKey?: string
}>) {
  const navigate = useNavigate()

  return (
    <AuthProvider
      authClient={authClient}
      queryClient={queryClient}
      Link={RouterLink}
      navigate={({ to, replace }) => navigate({ to, replace })}
      emailAndPassword={{
        enabled: true,
        confirmPassword: true,
        forgotPassword: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
        name: true,
        rememberMe: true,
        requireEmailVerification: true,
      }}
      basePaths={{ auth: "/auth", settings: "/account/settings" }}
      additionalFields={[
        {
          name: "username",
          label: "Username",
          placeholder: "garage-name",
          required: true,
          type: "string",
          signUp: "above",
          validate: (value) => {
            if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{3,32}$/.test(value)) {
              throw new Error(
                "Use 3 to 32 letters, numbers, underscores, or hyphens for your username.",
              )
            }
          },
        },
      ]}
      plugins={[
        usernamePlugin(),
        magicLinkPlugin(),
        passkeyPlugin(),
        twoFactorPlugin(),
        deleteUserPlugin({ sendDeleteAccountVerification: true }),
        themePlugin({ useTheme }),
        ...(turnstileSiteKey
          ? [
              captchaPlugin({
                render: (props) => <TurnstileWidget {...props} siteKey={turnstileSiteKey} />,
              }),
            ]
          : []),
      ]}
    >
      {children}
    </AuthProvider>
  )
}
