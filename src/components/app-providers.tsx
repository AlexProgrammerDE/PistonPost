import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import type { PropsWithChildren } from "react"

import { AuthenticationProvider } from "@/components/providers"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CookieConsentProvider } from "@/lib/integrations/cookie-consent"
import { PostHogProvider } from "@/lib/integrations/posthog"

export function AppProviders({
  children,
  queryClient,
  turnstileSiteKey,
}: PropsWithChildren<{
  readonly queryClient: QueryClient
  readonly turnstileSiteKey?: string
}>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthenticationProvider queryClient={queryClient} turnstileSiteKey={turnstileSiteKey}>
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
