import { useEffect, type ReactNode } from "react"
import * as CookieConsent from "vanilla-cookieconsent"

import { isPostHogConfigured, syncPostHogConsent } from "@/lib/integrations/posthog"

let cookieConsentStarted = false

const COOKIE_CONSENT_COOKIE_NAME = "pistonpost_cookie_consent"
const COOKIE_CONSENT_REVISION = 1
const POSTHOG_COOKIE_NAMES = [/^ph_/, /^posthog/]

function syncAnalyticsConsent() {
  syncPostHogConsent(CookieConsent.acceptedCategory("analytics"))
}

export function showCookiePreferences() {
  if (isPostHogConfigured()) CookieConsent.showPreferences()
}

export function CookieConsentProvider({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    if (!isPostHogConfigured() || cookieConsentStarted) return

    cookieConsentStarted = true
    void CookieConsent.run({
      root: "body",
      autoShow: true,
      autoClearCookies: true,
      disablePageInteraction: false,
      hideFromBots: true,
      lazyHtmlGeneration: true,
      manageScriptTags: true,
      mode: "opt-in",
      revision: COOKIE_CONSENT_REVISION,
      cookie: {
        name: COOKIE_CONSENT_COOKIE_NAME,
        path: "/",
        sameSite: "Lax",
        secure: window.location.protocol === "https:",
        expiresAfterDays: (acceptType) => (acceptType === "all" ? 365 : 180),
        useLocalStorage: false,
      },
      guiOptions: {
        consentModal: {
          layout: "cloud inline",
          position: "bottom center",
          equalWeightButtons: true,
          flipButtons: false,
        },
        preferencesModal: {
          layout: "box",
          equalWeightButtons: true,
          flipButtons: false,
        },
      },
      onFirstConsent: syncAnalyticsConsent,
      onChange: syncAnalyticsConsent,
      onConsent: syncAnalyticsConsent,
      categories: {
        necessary: {
          enabled: true,
          readOnly: true,
        },
        analytics: {
          autoClear: {
            cookies: POSTHOG_COOKIE_NAMES.map((name) => ({ name })),
            reloadPage: false,
          },
          services: {
            posthog: {
              label: "PostHog",
              onAccept: () => syncPostHogConsent(true),
              onReject: () => syncPostHogConsent(false),
            },
          },
        },
      },
      language: {
        default: "en",
        autoDetect: "browser",
        translations: {
          en: {
            consentModal: {
              title: "Cookie preferences",
              description:
                'We use essential cookies to keep PistonPost working and optional analytics to understand which parts of the site are useful. Read our <a href="/cookie-policy">Cookie Policy</a>.',
              acceptAllBtn: "Accept all",
              acceptNecessaryBtn: "Reject optional",
              showPreferencesBtn: "Manage preferences",
            },
            preferencesModal: {
              title: "Cookie preferences",
              acceptAllBtn: "Accept all",
              acceptNecessaryBtn: "Reject optional",
              savePreferencesBtn: "Save preferences",
              closeIconLabel: "Close",
              serviceCounterLabel: "Service",
              sections: [
                {
                  description:
                    "Choose whether PistonPost can use optional analytics. Essential cookies stay enabled because accounts, security, and saved preferences depend on them.",
                },
                {
                  title: "Essential",
                  description:
                    "Required for account security, preferences, and core site behavior.",
                  linkedCategory: "necessary",
                },
                {
                  title: "Analytics",
                  description:
                    "Helps us understand page usage through anonymous route categories. PistonPost does not enable this unless you allow it.",
                  linkedCategory: "analytics",
                },
              ],
            },
          },
        },
      },
    })
  }, [])

  return children
}
