import { createFileRoute } from "@tanstack/react-router"

import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/terms")({
  head: () => {
    const description = "The practical rules for using PistonPost."
    return createSeoHead({
      title: "Terms · PistonPost",
      description,
      path: "/terms",
      twitterCard: "summary",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl("/terms"),
        url: absoluteUrl("/terms"),
        name: "PistonPost terms",
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
        <h1>Terms</h1>
        <p>
          PistonPost is a place to share posts, pictures, and videos. Use it lawfully, respect other
          people, and post only material you have the right to share.
        </p>
        <h2>Your content</h2>
        <p>
          You keep ownership of your work. You grant PistonPost the limited permission required to
          store, transform, and deliver it through the service.
        </p>
        <h2>Unlisted posts</h2>
        <p>
          Unlisted posts are not private. Anyone holding the link can view them, and recipients can
          share that link with others.
        </p>
        <h2>Moderation</h2>
        <p>
          Content may be restricted or removed when it violates these terms, creates a security
          risk, or is unlawful. Material moderation actions are recorded and communicated to the
          affected account.
        </p>
        <h2>Spam and abuse</h2>
        <p>
          Do not use PistonPost for repetitive promotion, deceptive links, search manipulation,
          impersonation, harassment, malware, or automated posting that disrupts the feed. Accounts
          and content involved in abuse may be limited, hidden, or removed.
        </p>
        <h2>Reporting problems</h2>
        <p>
          Signed-in users can report a post, comment, or profile from its action menu. Reports go to
          the moderation queue and do not remove content automatically. Include only the context a
          moderator needs and do not put passwords or unrelated private information in a report.
        </p>
        <h2>Search visibility</h2>
        <p>
          Public content from a new or unverified account may stay out of search engines during a
          short review period. It remains visible on PistonPost unless its visibility or moderation
          status changes.
        </p>
        <h2>Availability</h2>
        <p>
          The service may change as it develops. We work to preserve posts and historical links, but
          no online service can promise uninterrupted availability.
        </p>
      </article>
    </main>
  )
}
