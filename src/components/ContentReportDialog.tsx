"use client"

import { useSession } from "@better-auth-ui/react"
import { useMutation } from "@tanstack/react-query"
import { Flag } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { Button } from "@/components/ui/button"
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  contentReportReasons,
  isContentReportReason,
  type ContentReportReason,
  type ContentReportTarget,
} from "@/lib/content-report"
import { createContentReport } from "@/server/reports"

export function ContentReportDialog({
  target,
  variant = "ghost",
  size = "sm",
}: {
  readonly target: ContentReportTarget
  readonly variant?: "ghost" | "outline"
  readonly size?: "xs" | "sm"
}) {
  const session = useSession(authClient)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ContentReportReason>("spam")
  const [details, setDetails] = useState("")
  const mutation = useMutation({
    mutationFn: () => createContentReport({ data: { target, reason, details } }),
    onSuccess: () => {
      setOpen(false)
      setReason("spam")
      setDetails("")
      toast.success("Report sent. Thank you for flagging it.")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The report could not be sent.")
    },
  })

  return (
    <Credenza
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && !session.data?.user) {
          toast.error("Sign in to report content.")
          return
        }
        setOpen(nextOpen)
      }}
    >
      <CredenzaTrigger
        render={<Button variant={variant} size={size} disabled={session.isPending} />}
      >
        <Flag aria-hidden="true" data-icon="inline-start" />
        Report
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>Report this {target.type}?</CredenzaTitle>
          <CredenzaDescription>
            A moderator will review the report. Reporting does not remove content automatically.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`report-reason-${target.type}-${target.id}`}>Reason</FieldLabel>
              <Select
                value={reason}
                onValueChange={(value) => {
                  if (isContentReportReason(value)) setReason(value)
                }}
              >
                <SelectTrigger id={`report-reason-${target.type}-${target.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {contentReportReasons.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`report-details-${target.type}-${target.id}`}>
                Details
              </FieldLabel>
              <Textarea
                id={`report-details-${target.type}-${target.id}`}
                value={details}
                maxLength={1000}
                rows={4}
                placeholder="Add context that will help a moderator…"
                onChange={(event) => setDetails(event.currentTarget.value)}
              />
              <FieldDescription>
                Optional. Do not include passwords or private data.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose disabled={mutation.isPending} render={<Button variant="outline" />}>
            Cancel
          </CredenzaClose>
          <Button
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              mutation.mutate()
            }}
          >
            {mutation.isPending ? "Sending…" : "Send report"}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
