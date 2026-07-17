import { createFileRoute } from "@tanstack/react-router"

import { CookiePreferencesButton } from "@/components/CookiePreferencesButton"
import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/cookie-policy")({
  head: () => {
    const description = "How PistonPost uses essential storage and optional analytics."
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
        <p>
          PistonPost uses essential browser storage for accounts, security, preferences, and your
          cookie choice. Optional analytics stay off unless you allow them.
        </p>

        <h2>Essential storage</h2>
        <p>
          Better Auth uses secure cookies to keep you signed in and protect account actions. Theme
          and interface preferences may also be saved in your browser. These features are necessary
          for the site to work as requested.
        </p>
        <p>
          The <code>pistonpost_cookie_consent</code> cookie records your analytics choice. It lasts
          for up to 365 days after accepting all categories or 180 days after rejecting optional
          analytics.
        </p>
        <p>
          The <code>sidebar_state</code> cookie remembers whether you collapsed the navigation
          sidebar. It lasts for up to seven days.
        </p>

        <h2>Optional PostHog analytics</h2>
        <p>
          If you accept analytics, PostHog records anonymous page views using broad route categories
          such as post, tag, or profile. Dynamic post IDs, tag names, usernames, page titles,
          referrers, and query strings are removed before an event is sent.
        </p>
        <p>
          PostHog uses memory-only persistence on PistonPost. Autocapture, session replay, heatmaps,
          exception capture, and person profiles are disabled.
        </p>

        <h2>Cloudflare Analytics Engine</h2>
        <p>
          Post view counting does not set a cookie. PistonPost keeps only the aggregate total for
          each post and uses Cloudflare Analytics Engine for aggregate operational events. It does
          not store a list of who viewed a post.
        </p>

        <h2>Change your choice</h2>
        <p>You can reopen the preferences dialog and change optional analytics at any time.</p>
        <div className="not-typeset mt-4">
          <CookiePreferencesButton />
        </div>

        <h2>Contact</h2>
        <p>
          Questions about cookies or analytics can be sent to{" "}
          <a href="mailto:support@pistonmaster.net">support@pistonmaster.net</a>.
        </p>
      </article>
    </main>
  )
}
