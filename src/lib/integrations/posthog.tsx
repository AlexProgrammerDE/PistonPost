import posthog, { type CaptureResult, type Properties } from "posthog-js/dist/module.slim"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY?.trim()
const POSTHOG_HOST =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim() || "https://t.pistonmaster.net"
const POSTHOG_UI_HOST = "https://eu.posthog.com"
const PostHogContext = createContext<typeof posthog | null>(null)

const sensitivePropertyName =
  /(?:comment|content|element|email|error|exception|hash|href|message|name|path|post|query|referr|search|stack|text|title|url|user.agent)/i

export function classifyAnalyticsPath(pathname: string) {
  if (pathname === "/") return "home"
  if (pathname === "/following") return "following"
  if (pathname === "/privacy") return "privacy"
  if (pathname === "/terms") return "terms"
  if (pathname === "/cookie-policy") return "cookie-policy"

  if (pathname === "/account/posts/new") return "account-post-new"
  if (pathname.startsWith("/account/posts")) return "account-posts"
  if (pathname.startsWith("/account/settings")) return "account-settings"
  if (pathname.startsWith("/account")) return "account"

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

  const { ToolbarExtensions } = await import("posthog-js/dist/extension-bundles")

  posthog.init(POSTHOG_KEY, {
    __extensionClasses: ToolbarExtensions,
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    defaults: "2026-01-30",
    persistence: "memory",
    opt_out_capturing_by_default: true,
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
  })

  return posthog
}

const postHogReady = initializePostHog().catch(() => null)

export function syncPostHogConsent(accepted: boolean) {
  if (!POSTHOG_KEY || typeof window === "undefined") return

  void postHogReady.then((client) => {
    if (!client) return

    if (accepted) {
      client.opt_in_capturing({ captureEventName: false })
      return
    }

    client.opt_out_capturing()
  })
}

export function PostHogProvider({ children }: { readonly children: ReactNode }) {
  const [client, setClient] = useState<typeof posthog | null>(null)

  useEffect(() => {
    let active = true

    void postHogReady.then((readyClient) => {
      if (active) setClient(readyClient)
    })

    return () => {
      active = false
    }
  }, [])

  if (!client) return children

  return <PostHogContext value={client}>{children}</PostHogContext>
}
