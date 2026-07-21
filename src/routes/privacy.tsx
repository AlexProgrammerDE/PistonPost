import { createFileRoute, Link } from "@tanstack/react-router"

import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/privacy")({
  head: () => {
    const description = "How PistonPost handles account, content, security, and analytics data."
    return createSeoHead({
      title: "Privacy Policy · PistonPost",
      description,
      path: "/privacy",
      twitterCard: "summary",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl("/privacy"),
        url: absoluteUrl("/privacy"),
        name: "PistonPost privacy policy",
        description,
      },
    })
  },
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="typeset typeset-post">
        <h1>Privacy Policy</h1>
        <p>Last updated: July 21, 2026.</p>
        <p>
          This policy explains what PistonPost currently handles when you use the service, why it is
          handled, which providers are involved, and the choices available to you.
        </p>

        <h2>Information PistonPost handles</h2>
        <ul>
          <li>
            <strong>Account and profile data:</strong> your email address, username, display name,
            avatar, profile details, account role and status, settings, sign-in methods, passkeys,
            two-factor settings, and active sessions.
          </li>
          <li>
            <strong>Content and activity:</strong> posts, media, tags, comments, reactions, follows,
            visibility choices, stored media properties, captions, and alt text. Uploaded images are
            cleaned in your browser to remove private and descriptive file metadata before
            PistonPost accepts them for storage.
          </li>
          <li>
            <strong>Moderation data:</strong> reports, the details supplied with them, moderation
            decisions, and audit events that record important account or content actions.
          </li>
          <li>
            <strong>Security and technical data:</strong> network address, user agent, device and
            browser signals, approximate location, request details, rate-limit activity, and
            reliability or performance events.
          </li>
          <li>
            <strong>Delivery data:</strong> email and push notification settings, transactional
            delivery outcomes, and push subscription capabilities supplied by your browser. A push
            capability includes its provider endpoint and encryption keys. PistonPost does not put
            those capabilities or message content in queue or analytics events.
          </li>
        </ul>

        <h2>How this information is used</h2>
        <p>PistonPost uses this information to:</p>
        <ul>
          <li>create and secure accounts and sessions;</li>
          <li>store, transform, display, and deliver posts and media;</li>
          <li>provide feeds, comments, reactions, follows, search, and notifications;</li>
          <li>send account, security, moderation, and other service messages;</li>
          <li>investigate reports, enforce the Terms of Service, and prevent abuse; and</li>
          <li>measure aggregate use, diagnose failures, and keep the service reliable.</li>
        </ul>

        <h2>Public and unlisted information</h2>
        <p>
          Public profiles and posts can be seen by anyone and may appear in public feeds, profile
          and tag pages, Atom feeds, sitemaps, and search engines. PistonPost can temporarily mark
          public content from a new or unverified account as ineligible for search indexing.
        </p>
        <p>
          Unlisted posts are excluded from normal public discovery, but anyone with the URL can view
          and reshare them. Do not use an unlisted post for information that must stay private.
        </p>

        <h2>Authentication and security</h2>
        <p>
          PistonPost uses Better Auth for account and session management. In production, it also
          uses Better Auth Infrastructure for authentication activity tracking and threat detection:
        </p>
        <ul>
          <li>
            <strong>Dash</strong> receives authentication, account, and security events. Depending
            on the event, this can include a user, account, or session identifier, email address,
            name, network address, approximate city and country, user agent, and event details.
          </li>
          <li>
            <strong>Sentinel</strong> creates a browser and device fingerprint from signals such as
            browser and platform details, language, time zone, screen and hardware characteristics,
            fonts, canvas, WebGL and audio characteristics, browser storage availability, plugins,
            automation indicators, and network connection data. It also receives the current page
            URL, a visitor or request identifier, network address, and approximate location.
          </li>
        </ul>
        <p>
          Sentinel runs when the application loads and attaches its identifier to authentication
          requests. Its risk result can allow, challenge, or block an authentication request. Dash
          and Sentinel are security functions and are not controlled by the optional PostHog
          analytics choice.
        </p>
        <p>
          Sensitive authentication actions can also use Cloudflare Turnstile to distinguish people
          from automated abuse. In production, password choices are checked against Have I Been
          Pwned using a partial hash lookup. The full password and full password hash are not sent
          to that service.
        </p>

        <h2>Analytics and post views</h2>
        <p>
          Each post has a public aggregate view count. To reduce repeated counts, PistonPost briefly
          combines the viewer&apos;s network address with the post identifier to create a one-way
          rate-limit key. The post record keeps the aggregate total, not a list of viewers.
          Cloudflare Analytics Engine receives aggregate view and operational events, including the
          post identifier, type, visibility, and viewing surface, without a viewer identity.
        </p>

        <h2>Push notifications</h2>
        <p>
          Push notifications are optional and enabled separately on each device. When enabled,
          PistonPost stores the browser&apos;s push capability with the signed-in session and sends
          generic comment, reply, moderation, and account security alerts. The alert can appear on a
          lock screen, so its text avoids post titles, comment text, usernames, and moderation
          reasons.
        </p>
        <p>
          Your browser routes encrypted alerts through its push provider. Depending on the browser
          and device, that provider can be Google, Mozilla, Apple, or Microsoft. PistonPost sends an
          encrypted payload and the provider learns the delivery endpoint, timing, and technical
          delivery details. Browser and operating-system notification settings also apply.
        </p>
        <p>
          Optional PostHog analytics stay disabled until you consent. When enabled, PistonPost sends
          pseudonymous page-view events using broad route categories such as post, tag, or profile.
          Temporary identifiers and standard browser or device properties added by the PostHog SDK
          may be included. Dynamic post IDs, tag names, usernames, page titles, referrers, query
          strings, and page content are removed before an event is sent.
        </p>
        <p>
          PostHog identifiers use memory-only persistence and are not saved as persistent analytics
          cookies by PistonPost. Autocapture, session replay, heatmaps, exception capture, person
          profiles, feature flags, and surveys are disabled. PistonPost also respects the
          browser&apos;s Do Not Track signal for this optional analytics. The{" "}
          <Link to="/cookie-policy">Cookie Policy</Link> explains the control in more detail.
        </p>

        <h2>Service providers and processing locations</h2>
        <p>PistonPost currently relies on these providers:</p>
        <ul>
          <li>
            <strong>Cloudflare</strong> for edge hosting, traffic delivery, the application
            database, media storage and delivery, image and video processing, email delivery, bot
            checks, rate limiting, queues, workflows, and aggregate operational analytics.
          </li>
          <li>
            <strong>Better Auth Infrastructure</strong> for the Dash and Sentinel authentication
            security functions described above.
          </li>
          <li>
            <strong>PostHog</strong> for optional analytics through an EU-hosted endpoint when you
            consent.
          </li>
          <li>
            <strong>Have I Been Pwned</strong> for compromised-password checks in production.
          </li>
          <li>
            <strong>Browser push providers</strong> operated by Google, Mozilla, Apple, or Microsoft
            when you enable push on a compatible device.
          </li>
        </ul>
        <p>
          Cloudflare handles traffic through its global network. Processing locations for other
          provider records depend on the production account configuration and each provider&apos;s
          infrastructure. External sites linked from posts or profiles have their own privacy
          practices.
        </p>

        <h2>How long information is kept</h2>
        <ul>
          <li>
            Account, profile, and content records are normally kept until you delete the content or
            your account.
          </li>
          <li>
            Standard remembered sign-in cookies last for up to seven days unless you sign out,
            revoke the session, or choose not to be remembered. Short-lived authentication and
            verification data expires sooner.
          </li>
          <li>Incomplete staged media uploads are eligible for cleanup after 24 hours.</li>
          <li>
            A push capability is removed when its session is revoked, you disable push on that
            device, the provider reports that it expired, or the account is deleted. Push providers
            can retain an encrypted pending alert for up to 24 hours for delivery.
          </li>
          <li>
            Account deletion removes account data and content through database deletion and an
            asynchronous media cleanup workflow. Deleted information can remain temporarily in
            provider cache, backup, or recovery systems until those systems expire it.
          </li>
          <li>
            Moderation reports and audit events currently have no fixed automatic expiry. They can
            remain after an account or content is deleted. Account links are cleared where the data
            model supports it, but event and target identifiers can remain. A completed account
            deletion records the former account identifier so the deletion can be audited.
          </li>
        </ul>
        <p>
          Provider-side security and analytics records follow the current production account
          settings and provider agreements. PistonPost does not publish one fixed retention period
          for all of those records. Contact us if you need the current configuration for a privacy
          request.
        </p>

        <h2>Your choices</h2>
        <p>
          Account settings let you update your profile and security settings, manage sessions, and
          start account deletion. Notification settings let you choose comment and reply alerts by
          channel and enable or disable push on each device. You can edit or delete content through
          its available controls and can change optional analytics consent at any time. PistonPost
          does not currently provide a self-service account export.
        </p>
        <p>
          To ask for access to a copy of your information, correction, deletion, restriction, or
          another privacy request available under applicable law, email us. We may need to verify
          that the account belongs to you before acting on the request.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy when the service or its data handling changes. The date at the
          top shows when this version took effect.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions and requests can be sent to{" "}
          <a href="mailto:support@pistonmaster.net">support@pistonmaster.net</a>. You can also read
          the <Link to="/terms">Terms of Service</Link> and{" "}
          <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
      </article>
    </main>
  )
}
