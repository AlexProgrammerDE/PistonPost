"use client"

import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { createServerOnlyFn } from "@tanstack/react-start"
import { CheckCircle2, MailX } from "lucide-react"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { AppRequestContext } from "@/server"
import { unsubscribeFromEmail } from "@/server/email-preferences"

const oneClickUnsubscribe = createServerOnlyFn(
  async ({ request, context }: { request: Request; context: AppRequestContext }) => {
    const { handleOneClickUnsubscribe } = await import("@/server/email-one-click")
    return handleOneClickUnsubscribe(request, context)
  },
)

export const Route = createFileRoute("/email/unsubscribe")({
  validateSearch: z.object({ token: z.string().max(4096).catch("") }),
  head: () => ({
    meta: [
      { title: "Email preferences · PistonPost" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  server: {
    handlers: {
      POST: oneClickUnsubscribe,
    },
  },
  component: EmailUnsubscribe,
})

const preferenceNames = {
  "comment-email": "Comment emails",
  "reply-email": "Reply emails",
  "product-email": "Product updates",
} as const

function EmailUnsubscribe() {
  const { token } = Route.useSearch()
  const unsubscribe = useMutation({
    mutationFn: () => unsubscribeFromEmail({ data: { token } }),
  })
  const preferenceName = unsubscribe.data
    ? preferenceNames[unsubscribe.data.preference]
    : "These emails"
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-12 sm:px-6">
      <div className="w-full border-y py-8">
        <MailX aria-hidden="true" className="size-6 text-muted-foreground" />
        <h1 className="mt-4 font-heading text-2xl font-bold">Stop these emails?</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Security, account, and moderation messages will still arrive when they are needed. You can
          turn optional emails back on from notification settings.
        </p>
        {unsubscribe.isSuccess ? (
          <Alert className="mt-6">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>{preferenceName} are off</AlertTitle>
            <AlertDescription>Your email preference has been saved.</AlertDescription>
          </Alert>
        ) : unsubscribe.isError ? (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>This link could not be used</AlertTitle>
            <AlertDescription>
              It may be invalid or expired. Sign in to change the preference from account settings.
            </AlertDescription>
          </Alert>
        ) : (
          <Button
            className="mt-6"
            disabled={!token || unsubscribe.isPending}
            onClick={() => unsubscribe.mutate()}
          >
            {unsubscribe.isPending ? (
              <>
                <Spinner data-icon="inline-start" />
                Saving…
              </>
            ) : (
              "Stop these emails"
            )}
          </Button>
        )}
        <p className="mt-6 text-sm">
          <Link to="/" className="text-muted-foreground underline underline-offset-4">
            Return to PistonPost
          </Link>
        </p>
      </div>
    </main>
  )
}
