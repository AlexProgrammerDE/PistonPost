import { Button } from "@/components/ui/button"
import { showCookiePreferences } from "@/lib/integrations/cookie-consent"
import { usePostHogClient } from "@/lib/integrations/posthog"

export function CookiePreferencesButton() {
  const posthog = usePostHogClient()

  if (!posthog) return null

  return <Button onClick={showCookiePreferences}>Manage cookie preferences</Button>
}
