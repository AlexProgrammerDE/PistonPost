import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { ThemeProvider, useTheme } from "next-themes"
import { useEffect, type PropsWithChildren } from "react"

import { AuthenticationProvider } from "@/components/providers"
import { PushSubscriptionSync } from "@/components/push-subscription-sync"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CookieConsentProvider } from "@/lib/integrations/cookie-consent"
import { PostHogProvider } from "@/lib/integrations/posthog"

const LIGHT_THEME_COLOR = "#fff9ed"
const DARK_THEME_COLOR = "#241b1b"

function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return
    const color = resolvedTheme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR
    const themeColorMeta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    for (const element of themeColorMeta) element.content = color
  }, [resolvedTheme])

  return null
}

export function AppProviders({
  children,
  queryClient,
  turnstileSiteKey,
  vapidPublicKey,
}: PropsWithChildren<{
  readonly queryClient: QueryClient
  readonly turnstileSiteKey?: string
  readonly vapidPublicKey: string | null
}>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <ThemeColorSync />
        <AuthenticationProvider queryClient={queryClient} turnstileSiteKey={turnstileSiteKey}>
          <PushSubscriptionSync vapidPublicKey={vapidPublicKey} />
          <CookieConsentProvider>
            <PostHogProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </PostHogProvider>
          </CookieConsentProvider>
        </AuthenticationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
