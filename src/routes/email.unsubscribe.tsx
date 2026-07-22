"use client"

import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CheckCircle2, MailX } from "lucide-react"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { unsubscribeFromProductEmail } from "@/server/email-preferences"

export const Route = createFileRoute("/email/unsubscribe")({
  validateSearch: z.object({ token: z.string().max(4096).catch("") }),
  head: () => ({
    meta: [
      { title: "Email preferences · PistonPost" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProductEmailUnsubscribe,
})

function ProductEmailUnsubscribe() {
  const { token } = Route.useSearch()
  const unsubscribe = useMutation({
    mutationFn: () => unsubscribeFromProductEmail({ data: { token } }),
  })
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-12 sm:px-6">
      <div className="w-full border-y py-8">
        <MailX aria-hidden="true" className="size-6 text-muted-foreground" />
        <h1 className="mt-4 font-heading text-2xl font-bold">Stop product update emails?</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Security, account, and moderation messages will still arrive when they are needed. You can
          turn product updates back on from account settings.
        </p>
        {unsubscribe.isSuccess ? (
          <Alert className="mt-6">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Product updates are off</AlertTitle>
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
              "Stop product update emails"
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
