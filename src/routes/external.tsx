import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
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
      {destination ? (
        <Alert className="w-full max-w-lg">
          <ExternalLink aria-hidden="true" />
          <AlertTitle>Open an external link?</AlertTitle>
          <AlertDescription className="grid gap-4">
            <p>
              This link goes to {externalLinkDestination(destination)}. External sites have their
              own privacy and security policies.
            </p>
            <code className="border-y py-3 text-xs break-all text-muted-foreground">
              {destination}
            </code>
            <ButtonGroup aria-label="External link actions" className="flex-wrap">
              <Button
                nativeButton={false}
                render={
                  <a
                    href={destination}
                    rel={userGeneratedLinkRel(true)}
                    aria-label="Open external link"
                  />
                }
              >
                Open link
                <ExternalLink aria-hidden="true" data-icon="inline-end" />
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
                <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                Back to PistonPost
              </Button>
            </ButtonGroup>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive" className="w-full max-w-lg">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Link unavailable</AlertTitle>
          <AlertDescription className="grid gap-4">
            <p>This destination is missing or uses a link type PistonPost does not allow.</p>
            <Button
              className="w-fit"
              variant="outline"
              nativeButton={false}
              render={<Link to="/" />}
            >
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              Back to PistonPost
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </main>
  )
}
