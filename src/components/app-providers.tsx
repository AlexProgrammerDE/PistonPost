import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import type { PropsWithChildren } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CookieConsentProvider } from "@/lib/integrations/cookie-consent"
import { PostHogProvider } from "@/lib/integrations/posthog"

export function AppProviders({
  children,
  queryClient,
}: PropsWithChildren<{ readonly queryClient: QueryClient }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <CookieConsentProvider>
          <PostHogProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </PostHogProvider>
        </CookieConsentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
