import { createFileRoute } from "@tanstack/react-router"

import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/privacy")({
  head: () => {
    const description = "How PistonPost handles account, post, media, and operational data."
    return createSeoHead({
      title: "Privacy · PistonPost",
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
        <h1>Privacy</h1>
        <p>
          PistonPost stores the information needed to run your account, show your posts and media,
          and protect the service from abuse.
        </p>
        <h2>What we store</h2>
        <p>
          Account records include your email address, profile, security settings, and active
          sessions. Content records include posts, media, tags, comments, and reactions. Operational
          systems retain limited security, delivery, and reliability events.
        </p>
        <h2>How data is used</h2>
        <p>
          Data is used to display what you post, authenticate your account, deliver messages you
          requested, enforce moderation, and keep PistonPost reliable.
        </p>
        <h2>Analytics</h2>
        <p>
          Each post keeps a public aggregate view total without storing who viewed it. Cloudflare
          Analytics Engine also records aggregate operational events and post views. Optional
          PostHog analytics stay disabled until you allow them and receive only anonymous route
          categories. PistonPost disables PostHog autocapture, session replay, and person profiles,
          and removes dynamic URLs and content before sending an event. Read the{" "}
          <a href="/cookie-policy">Cookie Policy</a> for details and preference controls.
        </p>
        <h2>Deletion and exports</h2>
        <p>
          You can request an account export or deletion from account settings. Destructive media
          work runs asynchronously and is verified before the request is considered complete.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about privacy can be sent to{" "}
          <a href="mailto:support@pistonmaster.net">support@pistonmaster.net</a>.
        </p>
      </article>
    </main>
  )
}
