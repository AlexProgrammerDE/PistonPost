import { createFileRoute, Link } from "@tanstack/react-router"

import { CookiePreferencesButton } from "@/components/CookiePreferencesButton"
import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/cookie-policy")({
  head: () => {
    const description = "How PistonPost uses cookies, local storage, and similar technologies."
    return createSeoHead({
      title: "Cookie Policy · PistonPost",
      description,
      path: "/cookie-policy",
      twitterCard: "summary",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl("/cookie-policy"),
        url: absoluteUrl("/cookie-policy"),
        name: "PistonPost cookie policy",
        description,
      },
    })
  },
  component: CookiePolicyPage,
})

function CookiePolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="typeset typeset-post">
        <h1>Cookie Policy</h1>
        <p>Last updated: July 19, 2026.</p>
        <p>
          This policy describes the cookies, browser storage, and similar technologies PistonPost
          currently uses. Optional PostHog analytics stay off unless you allow them. Authentication,
          security, and preferences you request can still use the technologies listed below.
        </p>

        <h2>Cookies PistonPost can set</h2>
        <p>
          Better Auth cookie names normally start with <code>pistonpost.</code>. Secure production
          cookies add the <code>__Secure-</code> prefix. A large encrypted value can be split across
          numbered cookie chunks.
        </p>
        <table>
          <thead>
            <tr>
              <th>Cookie name or pattern</th>
              <th>Purpose</th>
              <th>Typical lifetime</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>pistonpost.session_token</code> and <code>_multi-*</code> variants
              </td>
              <td>Keeps the current account, and any additional saved sessions, signed in.</td>
              <td>Up to 7 days, or the browser session when remember me is off.</td>
            </tr>
            <tr>
              <td>
                <code>pistonpost.session_data</code> and numbered chunks
              </td>
              <td>Holds a short-lived encrypted session cache.</td>
              <td>5 minutes; stored as a session cookie when remember me is off.</td>
            </tr>
            <tr>
              <td>
                <code>pistonpost.dont_remember</code>
              </td>
              <td>Tells the authentication system to use session-only sign-in cookies.</td>
              <td>Browser session.</td>
            </tr>
            <tr>
              <td>
                <code>pistonpost.two_factor</code>
              </td>
              <td>Completes a two-factor sign-in.</td>
              <td>10 minutes.</td>
            </tr>
            <tr>
              <td>
                <code>pistonpost.trust_device</code>
              </td>
              <td>Remembers a device after you choose to trust it during two-factor sign-in.</td>
              <td>30 days.</td>
            </tr>
            <tr>
              <td>
                <code>pistonpost.better-auth-passkey</code>
              </td>
              <td>Stores a temporary passkey challenge.</td>
              <td>Browser session and cleared after the passkey flow.</td>
            </tr>
            <tr>
              <td>
                <code>pistonpost.admin_session</code>
              </td>
              <td>Lets an authorized administrator return from an impersonation session.</td>
              <td>Up to 7 days and cleared after returning from impersonation.</td>
            </tr>
            <tr>
              <td>
                <code>better-auth.last_used_login_method</code>
              </td>
              <td>Remembers the sign-in method last used in this browser.</td>
              <td>30 days.</td>
            </tr>
            <tr>
              <td>
                <code>pistonpost_cookie_consent</code>
              </td>
              <td>Records whether you allowed optional PostHog analytics.</td>
              <td>365 days after acceptance or 180 days after rejection.</td>
            </tr>
            <tr>
              <td>
                <code>sidebar_state</code>
              </td>
              <td>Remembers whether you collapsed the navigation sidebar.</td>
              <td>7 days.</td>
            </tr>
          </tbody>
        </table>

        <h2>Local storage</h2>
        <p>
          The <code>theme</code> local-storage entry remembers your light, dark, or system theme
          choice. It stays until you change it, clear site data, or remove it through your browser.
          PistonPost does not use local storage for persistent PostHog analytics identifiers.
        </p>

        <h2>Better Auth Sentinel fingerprinting</h2>
        <p>
          Better Auth Sentinel is a security service, not optional analytics. It derives a visitor
          identifier from browser and device signals, sends those signals and the current page URL
          to Better Auth Infrastructure, and attaches an identifier to authentication requests. This
          helps detect bots, credential stuffing, and suspicious sign-ins. Sentinel does not depend
          on your PostHog analytics choice.
        </p>
        <p>
          The signals can include browser, platform, language, time zone, screen, hardware, font,
          canvas, WebGL, audio, plugin, storage-availability, automation, and network-connection
          characteristics. Sentinel also processes the network address and approximate location
          associated with the request. Read the <Link to="/privacy">Privacy Policy</Link> for more
          detail.
        </p>

        <h2>Optional PostHog analytics</h2>
        <p>
          If you accept analytics, PostHog receives pseudonymous page-view events using broad route
          categories such as post, tag, or profile. Temporary identifiers and standard browser or
          device properties may be included. Dynamic post IDs, tag names, usernames, page titles,
          referrers, query strings, and page content are removed before an event is sent.
        </p>
        <p>
          PostHog uses memory-only persistence on PistonPost, so PistonPost does not set persistent
          PostHog analytics cookies. Autocapture, session replay, heatmaps, exception capture,
          person profiles, feature flags, and surveys are disabled. A browser Do Not Track signal
          also keeps this optional analytics off.
        </p>

        <h2>Cookie-free post-view processing</h2>
        <p>
          Post view counting does not set a cookie. PistonPost briefly processes the network address
          to create a one-way rate-limit key that reduces repeated counts. The post record keeps an
          aggregate total, not a list of viewers. Cloudflare Analytics Engine also receives
          aggregate post-view and operational events without a viewer identity.
        </p>

        <h2>Change your choice</h2>
        <p>
          When optional PostHog analytics is configured, you can reopen the preferences dialog and
          change your choice at any time. Clearing site data can sign you out and reset saved
          preferences.
        </p>
        <div className="not-typeset mt-4">
          <CookiePreferencesButton />
        </div>

        <h2>Changes and contact</h2>
        <p>
          We may update this policy when the service changes. The date at the top shows when this
          version took effect. Questions about cookies or analytics can be sent to{" "}
          <a href="mailto:support@pistonmaster.net">support@pistonmaster.net</a>. You can also read
          the <Link to="/terms">Terms of Service</Link>.
        </p>
      </article>
    </main>
  )
}
