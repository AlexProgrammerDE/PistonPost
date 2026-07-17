"use client"

import { useSession } from "@better-auth-ui/react"
import { useMutation } from "@tanstack/react-query"
import { Flag } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
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
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && !session.data?.user) {
          toast.error("Sign in to report content.")
          return
        }
        setOpen(nextOpen)
      }}
    >
      <AlertDialogTrigger
        render={<Button variant={variant} size={size} disabled={session.isPending} />}
      >
        <Flag aria-hidden="true" data-icon="inline-start" />
        Report
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Report this {target.type}?</AlertDialogTitle>
          <AlertDialogDescription>
            A moderator will review the report. Reporting does not remove content automatically.
          </AlertDialogDescription>
        </AlertDialogHeader>
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
            <FieldLabel htmlFor={`report-details-${target.type}-${target.id}`}>Details</FieldLabel>
            <Textarea
              id={`report-details-${target.type}-${target.id}`}
              value={details}
              maxLength={1000}
              rows={4}
              placeholder="Add context that will help a moderator…"
              onChange={(event) => setDetails(event.currentTarget.value)}
            />
            <FieldDescription>Optional. Do not include passwords or private data.</FieldDescription>
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              mutation.mutate()
            }}
          >
            {mutation.isPending ? "Sending…" : "Send report"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
