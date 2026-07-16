import { Cookie } from "lucide-react"

import { Button } from "@/components/ui/button"
import { showCookiePreferences } from "@/lib/integrations/cookie-consent"
import { usePostHogClient } from "@/lib/integrations/posthog"

export function CookiePreferencesButton() {
  const posthog = usePostHogClient()

  if (!posthog) return null

  return (
    <Button onClick={showCookiePreferences}>
      <Cookie aria-hidden="true" data-icon="inline-start" />
      Manage cookie preferences
    </Button>
  )
}
