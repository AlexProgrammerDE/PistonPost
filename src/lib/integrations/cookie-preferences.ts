import * as CookieConsent from "vanilla-cookieconsent"

import { isPostHogConfigured } from "@/lib/integrations/posthog-client"

export function showCookiePreferences() {
  if (isPostHogConfigured()) CookieConsent.showPreferences()
}
