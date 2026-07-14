import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms · PistonPost" },
      { name: "description", content: "The practical rules for using PistonPost." },
    ],
  }),
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
        <h2>Availability</h2>
        <p>
          The service may change as it develops. We work to preserve posts and historical links, but
          no online service can promise uninterrupted availability.
        </p>
      </article>
    </main>
  )
}
