import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { z } from "zod"

import { buttonVariants } from "@/components/ui/button"
import {
  MAX_USER_GENERATED_URL_LENGTH,
  externalLinkDestination,
  safeExternalUserGeneratedUrl,
  userGeneratedLinkRel,
} from "@/lib/user-generated-link"

const externalLinkSearchSchema = z.object({
  url: z.string().max(MAX_USER_GENERATED_URL_LENGTH).catch(""),
})

export const Route = createFileRoute("/external")({
  validateSearch: externalLinkSearchSchema,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: () => ({
    meta: [
      { title: "External link · PistonPost" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExternalLinkWarning,
})

function ExternalLinkWarning() {
  const { url } = Route.useSearch()
  const destination = safeExternalUserGeneratedUrl(url)

  return (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <div className="w-full max-w-lg">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Open an external link?
        </h1>
        {destination ? (
          <>
            <p className="mt-3 text-muted-foreground">
              This link goes to {externalLinkDestination(destination)}. External sites have their
              own privacy and security policies.
            </p>
            <p className="mt-4 border-y py-3 text-sm break-all text-muted-foreground">
              {destination}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={destination} rel={userGeneratedLinkRel(true)} className={buttonVariants()}>
                Open link
                <ExternalLink aria-hidden="true" data-icon="inline-end" />
              </a>
              <Link to="/" className={buttonVariants({ variant: "outline" })}>
                <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                Back to PistonPost
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-muted-foreground">
              This destination is missing or uses a link type PistonPost does not allow.
            </p>
            <Link to="/" className={buttonVariants({ variant: "outline", className: "mt-5" })}>
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              Back to PistonPost
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
