import { describe, expect, test } from "bun:test"

import type { CaptureResult } from "posthog-js/dist/module.slim"

import { classifyAnalyticsPath, sanitizePostHogCapture } from "./posthog"

const capture: CaptureResult = {
  uuid: "00000000-0000-4000-8000-000000000000",
  event: "$pageview",
  properties: {
    token: "public-project-token",
    distinct_id: "anonymous-id",
    $current_url: "https://post.pistonmaster.net/user/alex?token=secret",
    $pathname: "/user/alex",
    $title: "Alex's profile",
    $referrer: "https://post.pistonmaster.net/post/private-id",
    $elements: [{ text: "private post title" }],
    username: "alex",
  },
  $set: { email: "alex@example.com" },
}

describe("PostHog privacy boundary", () => {
  test("classifies dynamic pages without retaining their identifiers", () => {
    expect(classifyAnalyticsPath("/post/post-secret")).toBe("post")
    expect(classifyAnalyticsPath("/post/post-secret/edit")).toBe("post-edit")
    expect(classifyAnalyticsPath("/tag/private-tag")).toBe("tag")
    expect(classifyAnalyticsPath("/user/alex")).toBe("profile")
    expect(classifyAnalyticsPath("/settings/security")).toBe("account-settings")
  })

  test("removes content, identity, and dynamic URL properties", () => {
    const result = sanitizePostHogCapture(capture, {
      origin: "https://post.pistonmaster.net",
      pathname: "/user/alex",
    })

    expect(result).toEqual({
      uuid: capture.uuid,
      event: "$pageview",
      properties: {
        token: "public-project-token",
        distinct_id: "anonymous-id",
        $current_url: "https://post.pistonmaster.net/__route/profile",
        $pathname: "/__route/profile",
        route: "profile",
      },
    })
  })
})
