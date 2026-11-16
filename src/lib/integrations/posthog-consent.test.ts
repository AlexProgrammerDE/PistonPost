import { describe, expect, test } from "bun:test"

import { Schema } from "effect"

import { cookieAcceptsAnalytics } from "./posthog"

const token = "phc_test"
const consentKey = `__ph_opt_in_out_${token}`

function consentCookie(categories: readonly string[], revision = 1) {
  const value = JSON.stringify({
    categories,
    revision,
    data: null,
    consentTimestamp: "2026-11-01T00:00:00.000Z",
    consentId: "c1a0a4f2-6b4b-4f43-9d5b-0a1f5e0f7c11",
    services: { necessary: [], analytics: categories.includes("analytics") ? ["posthog"] : [] },
    languageCode: "en",
    lastConsentTimestamp: "2026-11-01T00:00:00.000Z",
  })
  return `sidebar_state=true; pistonpost_cookie_consent=${encodeURIComponent(value)}`
}

// posthog-js reads browser globals when it loads, and Bun shares globals and modules between test
// files. Run the SDK in a child process with a minimal browser environment instead.
const browserScript = `
const store = new Map(JSON.parse(process.env.TEST_STORAGE))
const storage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size },
}
const location = new URL("https://post.example/user/alex")
let cookie = process.env.TEST_COOKIE
const document = {
  get cookie() { return cookie },
  set cookie(value) { if (!value.includes("Max-Age=0")) cookie += "; " + value },
  location, readyState: "complete", referrer: "", title: "",
  addEventListener() {}, removeEventListener() {}, createElement: () => ({}),
}
Object.assign(globalThis, {
  window: globalThis, localStorage: storage, sessionStorage: storage, document, location,
  screen: { width: 1, height: 1 }, innerWidth: 1, innerHeight: 1,
  addEventListener() {}, removeEventListener() {},
})
const { PostHog } = await import("posthog-js/dist/module.slim")
const { cookieAcceptsAnalytics, initializePostHogWithConsent } = await import(process.env.TEST_MODULE)
const sent = []
const client = initializePostHogWithConsent(new PostHog(), "${token}", {
  api_host: "https://posthog.invalid",
  persistence: "memory",
  advanced_disable_flags: true,
  capture_pageview: false,
  before_send: (capture) => { if (capture) sent.push(capture.event); return null },
}, cookieAcceptsAnalytics(document.cookie))
client.capture("probe")
console.log(JSON.stringify({ sent, stored: store.get("${consentKey}") ?? null }))
// The SDK keeps flush timers alive, so end the process once the result is printed.
process.exit(0)
`

const browserResultSchema = Schema.fromJsonString(
  Schema.Struct({ sent: Schema.Array(Schema.String), stored: Schema.NullOr(Schema.String) }),
)

async function runPostHog(cookie: string, storage: Record<string, string>) {
  const child = Bun.spawn([process.execPath, "-e", browserScript], {
    env: {
      ...process.env,
      VITE_PUBLIC_POSTHOG_KEY: "",
      TEST_COOKIE: cookie,
      TEST_MODULE: new URL("./posthog.tsx", import.meta.url).pathname,
      TEST_STORAGE: JSON.stringify(Object.entries(storage)),
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited])
  expect(exitCode).toBe(0)
  return Schema.decodeUnknownSync(browserResultSchema)(output.trim().split("\n").at(-1))
}

describe("PostHog consent", () => {
  test("ignores a stale PostHog opt-in when the consent cookie is missing", async () => {
    const result = await runPostHog("sidebar_state=true", { [consentKey]: "1" })

    expect(result.sent).toEqual([])
    expect(result.stored).toBeNull()
  })

  test("ignores a stale PostHog opt-in when analytics was rejected", async () => {
    const result = await runPostHog(consentCookie(["necessary"]), { [consentKey]: "1" })

    expect(result.sent).toEqual([])
    expect(result.stored).toBeNull()
  })

  test("captures when the consent cookie accepts analytics", async () => {
    const result = await runPostHog(consentCookie(["necessary", "analytics"]), {})

    expect(result.sent).toEqual(["probe"])
    expect(result.stored).toBe("1")
  })

  test("reads analytics consent only from a valid, current consent cookie", () => {
    expect(cookieAcceptsAnalytics(consentCookie(["necessary", "analytics"]))).toBe(true)
    expect(cookieAcceptsAnalytics(consentCookie(["necessary"]))).toBe(false)
    expect(cookieAcceptsAnalytics(consentCookie(["necessary", "analytics"], 0))).toBe(false)
    expect(cookieAcceptsAnalytics("pistonpost_cookie_consent=%7Bbroken")).toBe(false)
    expect(cookieAcceptsAnalytics("pistonpost_cookie_consent=%E0%A4%A")).toBe(false)
    expect(cookieAcceptsAnalytics("")).toBe(false)
  })
})
