import type { AuthConfig } from "@better-auth-ui/core"
import { captchaPlugin } from "@better-auth-ui/react/plugins"
import type { QueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useTheme } from "next-themes"
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react"

import { authClient } from "@/auth/client"
import { AuthProvider } from "@/components/auth/auth-provider"
import { TurnstileWidget } from "@/components/turnstile-widget"
import { authSettingsViewPaths, authViewPaths } from "@/lib/auth-ui-metadata"
import { deleteUserPlugin } from "@/lib/auth/delete-user-plugin"
import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin"
import { multiSessionPlugin } from "@/lib/auth/multi-session-plugin"
import { passkeyPlugin } from "@/lib/auth/passkey-plugin"
import { themePlugin } from "@/lib/auth/theme-plugin"
import { twoFactorPlugin } from "@/lib/auth/two-factor-plugin"
import { usernamePlugin } from "@/lib/auth/username-plugin"
import {
  preserveAvatarOriginal,
  removeManagedAvatar,
  uploadManagedAvatar,
} from "@/lib/uploads/avatar-upload"

function RouterLink({ href, ...props }: ComponentPropsWithoutRef<AuthConfig["Link"]>) {
  return <Link to={href} {...props} />
}

async function invalidateAvatarQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["profiles"] }),
    queryClient.invalidateQueries({ queryKey: ["posts"] }),
  ])
}

export function AuthenticationProvider({
  children,
  queryClient,
  redirectTo = "/",
  turnstileSiteKey,
}: PropsWithChildren<{
  readonly queryClient: QueryClient
  readonly redirectTo?: string
  readonly turnstileSiteKey?: string
}>) {
  const navigate = useNavigate()

  return (
    <AuthProvider
      authClient={authClient}
      queryClient={queryClient}
      Link={RouterLink}
      navigate={({ to, replace }) => navigate({ to, replace })}
      redirectTo={redirectTo}
      avatar={{
        extension: "inherit",
        resize: preserveAvatarOriginal,
        upload: async (file) => {
          const image = await uploadManagedAvatar(file)
          await invalidateAvatarQueries(queryClient)
          return image
        },
        delete: async () => {
          await removeManagedAvatar()
          await invalidateAvatarQueries(queryClient)
        },
      }}
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
      viewPaths={{ auth: authViewPaths, settings: authSettingsViewPaths }}
      plugins={[
        usernamePlugin({
          isUsernameAvailable: true,
          minUsernameLength: 1,
          maxUsernameLength: 32,
          usernamePrefix: "@",
          localization: { usernamePlaceholder: "garage-name" },
        }),
        magicLinkPlugin(),
        multiSessionPlugin(),
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
