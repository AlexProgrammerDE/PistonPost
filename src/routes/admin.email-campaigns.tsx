"use client"

import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { Eye, Mail, Send } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza"
import { useAppForm } from "@/lib/forms/app-form"
import {
  createEmailCampaign,
  getEmailCampaigns,
  previewEmailCampaign,
  sendEmailCampaign,
  type EmailCampaignInput,
} from "@/server/email-campaigns"

export const Route = createFileRoute("/admin/email-campaigns")({
  loader: () => getEmailCampaigns(),
  head: () => ({ meta: [{ title: "Email campaigns · PistonPost" }] }),
  component: EmailCampaigns,
})

const emptyCampaign: EmailCampaignInput = {
  subject: "",
  preview: "",
  heading: "",
  message: "",
  actionLabel: "",
  actionUrl: "",
}

function EmailCampaigns() {
  const campaigns = Route.useLoaderData()
  const router = useRouter()
  const preview = useMutation({
    mutationFn: (data: EmailCampaignInput) => previewEmailCampaign({ data }),
    onError: () => toast.error("The email preview could not be rendered."),
  })
  const create = useMutation({
    mutationFn: (data: EmailCampaignInput) => createEmailCampaign({ data }),
    onSuccess: async () => {
      toast.success("Email campaign saved as a draft")
      form.reset()
      preview.reset()
      await router.invalidate()
    },
    onError: () => toast.error("The campaign could not be saved."),
  })
  const send = useMutation({
    mutationFn: (id: string) => sendEmailCampaign({ data: { id } }),
    onSuccess: async () => {
      toast.success("Product update queued")
      await router.invalidate()
    },
    onError: () => toast.error("The campaign could not be queued."),
  })
  const form = useAppForm({
    defaultValues: emptyCampaign,
    onSubmit: async ({ value }) => create.mutateAsync(value),
  })

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 border-b pb-6">
        <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          Administration
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight">Email campaigns</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Prepare an optional product update, review the rendered email, then queue it deliberately.
          Only people who have product emails enabled at delivery time receive it.
        </p>
      </header>

      <section aria-labelledby="new-campaign-title" className="border-b pb-10">
        <h2 id="new-campaign-title" className="text-lg font-semibold">
          New draft
        </h2>
        <form
          className="mt-5 grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <div className="grid gap-5 sm:grid-cols-2">
              <form.AppField name="subject">
                {(field) => <field.TextField label="Subject" maxLength={160} required />}
              </form.AppField>
              <form.AppField name="preview">
                {(field) => (
                  <field.TextField
                    label="Inbox preview"
                    description="Keep this useful when the subject is truncated."
                    maxLength={200}
                    required
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="heading">
              {(field) => <field.TextField label="Heading" maxLength={120} required />}
            </form.AppField>
            <form.AppField name="message">
              {(field) => (
                <field.TextareaField label="Message" maxLength={2000} rows={7} required />
              )}
            </form.AppField>
            <div className="grid gap-5 sm:grid-cols-2">
              <form.AppField name="actionLabel">
                {(field) => (
                  <field.TextField
                    label="Action label"
                    description="Optional. Add both action fields or leave both empty."
                    maxLength={80}
                  />
                )}
              </form.AppField>
              <form.AppField name="actionUrl">
                {(field) => <field.TextField label="Action URL" type="url" inputMode="url" />}
              </form.AppField>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={preview.isPending}
                onClick={() => preview.mutate(form.state.values)}
              >
                <Eye aria-hidden="true" data-icon="inline-start" />
                {preview.isPending ? "Rendering…" : "Preview"}
              </Button>
              <form.SubmitButton>
                <Mail aria-hidden="true" data-icon="inline-start" />
                Save draft
              </form.SubmitButton>
            </div>
          </form.AppForm>
        </form>
        {preview.data ? (
          <div className="mt-8 border-t pt-6">
            <h3 className="font-medium">Rendered preview</h3>
            <p className="mt-1 text-sm text-muted-foreground">Subject: {preview.data.subject}</p>
            <iframe
              title="Rendered email preview"
              srcDoc={preview.data.html}
              sandbox=""
              className="mt-4 min-h-160 w-full border bg-white"
            />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="campaign-history-title" className="pt-10">
        <h2 id="campaign-history-title" className="text-lg font-semibold">
          Saved campaigns
        </h2>
        {campaigns.length === 0 ? (
          <p className="mt-4 border-y py-8 text-sm text-muted-foreground">
            No product email drafts have been saved.
          </p>
        ) : (
          <div className="mt-4 border-y">
            {campaigns.map((campaign) => (
              <article
                key={campaign.id}
                className="grid gap-4 border-b py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{campaign.subject}</h3>
                    <Badge variant="outline">{campaign.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {campaign.message}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                    {campaign.status === "draft"
                      ? `Saved ${campaign.createdAt.toLocaleDateString("en")}`
                      : `${campaign.sent} sent, ${campaign.skipped} skipped, ${campaign.queued} queued`}
                  </p>
                </div>
                {campaign.status === "draft" ? (
                  <Credenza>
                    <CredenzaTrigger render={<Button size="sm" />}>
                      <Send aria-hidden="true" data-icon="inline-start" />
                      Queue update
                    </CredenzaTrigger>
                    <CredenzaContent>
                      <CredenzaHeader>
                        <CredenzaTitle>Queue this product update?</CredenzaTitle>
                        <CredenzaDescription>
                          This cannot be recalled after delivery begins. Recipients are selected in
                          small batches and their current preference is checked again before send.
                        </CredenzaDescription>
                      </CredenzaHeader>
                      <CredenzaFooter>
                        <CredenzaClose render={<Button variant="outline" />}>
                          Keep draft
                        </CredenzaClose>
                        <Button disabled={send.isPending} onClick={() => send.mutate(campaign.id)}>
                          <Send aria-hidden="true" data-icon="inline-start" />
                          {send.isPending ? "Queueing…" : "Queue update"}
                        </Button>
                      </CredenzaFooter>
                    </CredenzaContent>
                  </Credenza>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
