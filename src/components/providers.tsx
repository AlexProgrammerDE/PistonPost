import type { AuthConfig } from "@better-auth-ui/core"
import type { QueryClient } from "@tanstack/react-query"
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router"
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react"

import { authClient } from "@/auth/client"
import { AuthProvider } from "@/components/auth/auth-provider"
import { createAuthenticationPlugins } from "@/components/authentication-plugins"
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/domain/validation"
import { withAuthReturnRedirect } from "@/lib/auth-return-redirect"
import {
  preserveAvatarSource,
  removeManagedAvatar,
  uploadManagedAvatar,
} from "@/lib/uploads/avatar-upload"

/** Sentence-case labels that match the rest of the interface. */
const authLocalization = {
  auth: {
    forgotPassword: "Forgot password",
    resetPassword: "Reset password",
    signIn: "Sign in",
    signOut: "Sign out",
    signUp: "Sign up",
    verifyEmail: "Verify email",
  },
}

function RouterLink({ href, ...props }: ComponentPropsWithoutRef<AuthConfig["Link"]>) {
  const location = useLocation()
  return <Link to={withAuthReturnRedirect(href, location)} {...props} />
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
  turnstileSiteKey,
}: PropsWithChildren<{
  readonly queryClient: QueryClient
  readonly turnstileSiteKey?: string
}>) {
  const navigate = useNavigate()
  const router = useRouter()

  return (
    <AuthProvider
      authClient={authClient}
      queryClient={queryClient}
      Link={RouterLink}
      navigate={({ to, replace }) => {
        void navigate({ to: withAuthReturnRedirect(to, router.state.location), replace })
      }}
      redirectTo="/"
      socialSignInMode="popup"
      avatar={{
        extension: "inherit",
        resize: preserveAvatarSource,
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
        minPasswordLength: MIN_PASSWORD_LENGTH,
        maxPasswordLength: MAX_PASSWORD_LENGTH,
        name: true,
        rememberMe: true,
        requireEmailVerification: true,
      }}
      basePaths={{ admin: "/admin", auth: "/auth", settings: "/settings" }}
      localization={authLocalization}
      plugins={createAuthenticationPlugins(turnstileSiteKey)}
    >
      {children}
    </AuthProvider>
  )
}
