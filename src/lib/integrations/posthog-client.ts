import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  posthog,
  type CaptureResult,
  type PostHog,
  type PostHogConfig,
  type Properties,
} from "posthog-js/dist/module.slim"
import { createContext, useContext } from "react"

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY?.trim()
const POSTHOG_HOST =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim() || "https://t.pistonmaster.net"
const POSTHOG_UI_HOST = "https://eu.posthog.com"
export const PostHogContext = createContext<typeof posthog | null>(null)

export const COOKIE_CONSENT_COOKIE_NAME = "pistonpost_cookie_consent"
export const COOKIE_CONSENT_REVISION = 1

// The fields vanilla-cookieconsent requires before it treats a stored choice as valid.
const consentCookieSchema = Schema.Struct({
  categories: Schema.Array(Schema.String),
  revision: Schema.Finite,
  consentId: Schema.String.check(Schema.isNonEmpty()),
  consentTimestamp: Schema.String,
  lastConsentTimestamp: Schema.String,
})
const decodeConsentCookie = Schema.decodeUnknownOption(Schema.fromJsonString(consentCookieSchema))

/**
 * Reads the analytics choice from the consent cookie. The cookie is the only source of truth: a
 * missing, expired, malformed, or outdated cookie means analytics stays off.
 */
export function cookieAcceptsAnalytics(cookieHeader: string) {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1 || part.slice(0, separator).trim() !== COOKIE_CONSENT_COOKIE_NAME) continue
    let value: string
    try {
      value = decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return false
    }
    return Option.match(decodeConsentCookie(value), {
      onNone: () => false,
      onSome: (consent) =>
        consent.revision === COOKIE_CONSENT_REVISION && consent.categories.includes("analytics"),
    })
  }
  return false
}

function postHogConsentKey(token: string) {
  return `__ph_opt_in_out_${token}`
}

/**
 * PostHog keeps its own opt-in flag, and it can outlive the consent cookie. Remove it before init
 * so the SDK starts opted out and cannot capture an initial page view on a stale opt-in.
 */
function forgetPostHogConsent(token: string) {
  const key = postHogConsentKey(token)
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* Storage can be blocked. PostHog then has no stored opt-in either. */
  }
  // PostHog migrates a cookie copy of the flag into local storage, so clear that copy too.
  document.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Lax`
}

/** Starts a PostHog client that captures only while the consent cookie accepts analytics. */
export function initializePostHogWithConsent(
  client: PostHog,
  token: string,
  config: Partial<PostHogConfig>,
  analyticsAccepted: boolean,
) {
  if (!analyticsAccepted) forgetPostHogConsent(token)
  client.init(token, { ...config, opt_out_capturing_by_default: true })
  if (analyticsAccepted && !client.has_opted_in_capturing()) {
    client.opt_in_capturing({ captureEventName: false })
  }
  return client
}

const sensitivePropertyName =
  /(?:comment|content|element|email|error|exception|hash|href|message|name|path|post|query|referr|search|stack|text|title|url|user.agent)/i

export function classifyAnalyticsPath(pathname: string) {
  if (pathname === "/") return "home"
  if (pathname === "/following") return "following"
  if (pathname === "/privacy") return "privacy"
  if (pathname === "/terms") return "terms"
  if (pathname === "/cookie-policy") return "cookie-policy"

  if (pathname === "/posts/new") return "account-post-new"
  if (pathname === "/posts" || pathname.startsWith("/posts/")) return "account-posts"
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "account-settings"

  if (pathname.startsWith("/post/") && pathname.endsWith("/edit")) return "post-edit"
  if (pathname.startsWith("/post/")) return "post"
  if (pathname.startsWith("/tag/")) return "tag"
  if (pathname.startsWith("/user/")) return "profile"
  if (pathname.startsWith("/auth")) return "auth"
  if (pathname.startsWith("/admin")) return "admin"
  if (pathname.startsWith("/media/")) return "media"

  return "other"
}

export function sanitizePostHogCapture(
  capture: CaptureResult | null,
  location: { readonly origin: string; readonly pathname: string },
): CaptureResult | null {
  if (!capture) return null

  const route = classifyAnalyticsPath(location.pathname)
  const routePath = `/__route/${route}`
  const properties: Properties = {}

  for (const [name, value] of Object.entries(capture.properties)) {
    if (!sensitivePropertyName.test(name)) properties[name] = value
  }

  properties.$current_url = new URL(routePath, location.origin).toString()
  properties.$pathname = routePath
  properties.route = route
  // Skip PostHog's GeoIP enrichment so events never gain city, postcode, or coordinates.
  properties.$geoip_disable = true

  return {
    uuid: capture.uuid,
    event: capture.event,
    properties,
    ...(capture.timestamp ? { timestamp: capture.timestamp } : {}),
  }
}

export function isPostHogConfigured() {
  return Boolean(POSTHOG_KEY)
}

export function usePostHogClient() {
  return useContext(PostHogContext)
}

async function initializePostHog() {
  if (typeof window === "undefined" || !POSTHOG_KEY) return null

  const { AnalyticsExtensions, ToolbarExtensions } =
    await import("posthog-js/dist/extension-bundles")

  return initializePostHogWithConsent(
    posthog,
    POSTHOG_KEY,
    {
      __extensionClasses: {
        ...ToolbarExtensions,
        historyAutocapture: AnalyticsExtensions.historyAutocapture,
      },
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      defaults: "2026-01-30",
      persistence: "memory",
      person_profiles: "never",
      respect_dnt: true,
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: false,
      capture_exceptions: false,
      capture_heatmaps: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      rageclick: false,
      save_campaign_params: false,
      save_referrer: false,
      mask_all_element_attributes: true,
      mask_all_text: true,
      before_send: (capture) => sanitizePostHogCapture(capture, window.location),
    },
    cookieAcceptsAnalytics(document.cookie),
  )
}

// oxlint-disable-next-line unicorn/prefer-top-level-await -- Awaiting here would block every importer until PostHog loads.
export const postHogReady = initializePostHog().catch(() => null)

export function syncPostHogConsent(accepted: boolean) {
  if (!POSTHOG_KEY || typeof window === "undefined") return

  void (async () => {
    const client = await postHogReady
    if (!client) return

    if (accepted) {
      if (!client.has_opted_in_capturing()) client.opt_in_capturing({ captureEventName: false })
      return
    }

    // Clearing the stored flag opts out because the client starts with opt_out_capturing_by_default.
    // Unlike opt_out_capturing, it leaves no PostHog entry in local storage after a rejection.
    client.clear_opt_in_out_capturing()
  })()
}
