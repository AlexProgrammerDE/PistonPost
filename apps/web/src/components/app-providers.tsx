import { Toaster } from "@pistonpost/ui/components/sonner"
import { TooltipProvider } from "@pistonpost/ui/components/tooltip"
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import type { PropsWithChildren } from "react"

export function AppProviders({
  children,
  queryClient,
}: PropsWithChildren<{ readonly queryClient: QueryClient }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
