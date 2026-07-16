import { createFileRoute, Link } from "@tanstack/react-router"
import { LogIn, Shield } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/migration")({
  head: () => {
    const description =
      "How existing PistonPost members regain access after the platform migration."
    return createSeoHead({
      title: "Your PistonPost account · PistonPost",
      description,
      path: "/migration",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl("/migration"),
        url: absoluteUrl("/migration"),
        name: "PistonPost account migration",
        description,
      },
    })
  },
  component: MigrationGuidance,
})

function MigrationGuidance() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <article className="typeset">
        <Badge variant="outline">Account migration</Badge>
        <h1>Your archive is here. Sign in fresh.</h1>
        <p className="lead">
          Existing posts, comments, reactions, profile details, ownership, and original timestamps
          stay attached to the email address from your old PistonPost account.
        </p>

        <Alert>
          <Shield />
          <AlertTitle>Old sign-in links and sessions do not transfer</AlertTitle>
          <AlertDescription>
            For your protection, PistonPost did not copy old sessions, magic links, verification
            tokens, or password credentials into the new account system.
          </AlertDescription>
        </Alert>

        <h2>Claim your existing account</h2>
        <ol>
          <li>Open the new sign-in page.</li>
          <li>Enter the same email address you used on the original PistonPost.</li>
          <li>Choose the magic-link option and open the new message from PistonPost.</li>
          <li>Review your profile and original posts after sign-in.</li>
        </ol>

        <div className="not-prose my-9 flex flex-wrap gap-3">
          <Button render={<Link to="/auth/$authView" params={{ authView: "magic-link" }} />}>
            <LogIn />
            Sign in by magic link
          </Button>
          <Button variant="outline" render={<Link to="/privacy" />}>
            Read the privacy notice
          </Button>
        </div>

        <Separator />

        <h2>If something is missing</h2>
        <p>
          A small number of legacy media references were already missing from the original archive.
          Those posts remain visible with a controlled placeholder instead of disappearing silently.
          If ownership, media order, or a historical URL looks wrong, contact support with the old
          post URL. Do not send passwords or sign-in links.
        </p>

        <h2>About unlisted posts</h2>
        <p>
          Unlisted posts stay out of public feeds, but anyone holding the link can view them. They
          are not private. Review or delete an unlisted post from your account dashboard if that no
          longer matches what you want.
        </p>
      </article>
    </main>
  )
}
