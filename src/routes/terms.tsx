import { createFileRoute, Link } from "@tanstack/react-router"

import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/terms")({
  head: () => {
    const description = "The terms that apply when you use PistonPost."
    return createSeoHead({
      title: "Terms of Service · PistonPost",
      description,
      path: "/terms",
      twitterCard: "summary",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl("/terms"),
        url: absoluteUrl("/terms"),
        name: "PistonPost terms of service",
        description,
      },
    })
  },
  component: TermsPage,
})

function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="typeset typeset-post">
        <h1>Terms of Service</h1>
        <p>Last updated: July 19, 2026.</p>
        <p>
          These terms apply when you access or use PistonPost. By creating an account or using the
          service, you agree to follow them. If you do not agree, do not use PistonPost.
        </p>

        <h2>Your account</h2>
        <p>
          Give us accurate account information, keep your sign-in methods secure, and tell us
          promptly if you think someone else has accessed your account. You are responsible for
          activity under your account unless it happened after you reported unauthorized access.
        </p>

        <h2>Your content</h2>
        <p>
          You keep ownership of the posts, comments, images, videos, profile information, and other
          material you submit. You give PistonPost permission to host, store, copy, resize,
          transcode, preview, cache, and display that material only as needed to operate, secure,
          and deliver the service. This permission also lets our infrastructure providers process
          the material for those purposes.
        </p>
        <p>
          You must have the rights and permissions needed to submit your content and to let
          PistonPost process it this way. You are responsible for what you submit.
        </p>

        <h2>Public and unlisted posts</h2>
        <p>
          Public posts and profiles can appear in PistonPost feeds, profile and tag pages, Atom
          feeds, sitemaps, and search engines. Unlisted posts are excluded from normal public
          discovery, but they are not private. Anyone with an unlisted link can open it and share it
          with other people.
        </p>

        <h2>What is not allowed</h2>
        <p>Do not use PistonPost to:</p>
        <ul>
          <li>break the law or encourage illegal activity;</li>
          <li>infringe another person&apos;s intellectual property, privacy, or other rights;</li>
          <li>harass, threaten, impersonate, or deliberately deceive another person;</li>
          <li>
            spread malware, probe the service, evade security controls, or disrupt availability;
          </li>
          <li>send repetitive promotion, deceptive links, or manipulate search and feeds; or</li>
          <li>automate posting or account activity in a way that harms people or the service.</li>
        </ul>

        <h2>Reports and moderation</h2>
        <p>
          Signed-in users can report a post, comment, or profile. Reports enter a moderation queue
          and do not remove content automatically. Include only the context a moderator needs, and
          do not put passwords or unrelated private information in a report.
        </p>
        <p>
          PistonPost may hide or remove content, limit an account, suspend access, or ban an account
          when we reasonably believe these terms were broken, the service or its users are at risk,
          or the law requires action. Material moderation actions are recorded and communicated to
          the affected account.
        </p>

        <h2>Search visibility</h2>
        <p>
          Public content from a new or unverified account may stay out of search engines during a
          review period. It remains visible on PistonPost unless its visibility or moderation status
          changes.
        </p>

        <h2>Deleting content or your account</h2>
        <p>
          You can delete your own posts and can start account deletion from account settings.
          Account deletion removes account data and content, while media cleanup runs asynchronously
          and is checked before the deletion workflow finishes. Some security, moderation, and audit
          records can remain as explained in the <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <h2>External links and availability</h2>
        <p>
          Posts and profiles can link to sites that PistonPost does not operate. We do not control
          their content or privacy practices. Use external sites at your own discretion.
        </p>
        <p>
          PistonPost may change as it develops. We work to preserve posts and historical links, but
          we cannot promise that every feature or the service itself will always be available,
          uninterrupted, or error-free.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We may update these terms when the service or its rules change. The date at the top shows
          when this version took effect. Your continued use after an update means the updated terms
          apply to your later use.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:support@pistonmaster.net">support@pistonmaster.net</a>. You can also read
          the <Link to="/privacy">Privacy Policy</Link> and{" "}
          <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
      </article>
    </main>
  )
}
