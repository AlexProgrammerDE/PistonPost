"use client"

import { useSession } from "@better-auth-ui/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Flag, TriangleAlert } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { TurnstileChallenge, type TurnstileChallengeHandle } from "@/components/TurnstileChallenge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import {
  contentReportReasons,
  isContentReportReason,
  type ContentReportReason,
  type ContentReportTarget,
} from "@/lib/content-report"
import { HUMAN_VERIFICATION_ERROR_MESSAGE, TURNSTILE_ACTIONS } from "@/lib/turnstile"
import { getPublicRuntimeConfig } from "@/server/public-config"
import { createContentReport } from "@/server/reports"

const MAX_REPORT_DETAILS_LENGTH = 1000

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
  const turnstile = useRef<TurnstileChallengeHandle>(null)
  const runtimeConfig = useQuery({
    queryKey: ["public-runtime-config"],
    queryFn: () => getPublicRuntimeConfig(),
    enabled: open,
    staleTime: Infinity,
  })
  const mutation = useMutation({
    mutationFn: async () => {
      const turnstileToken = await turnstile.current?.execute()
      if (!turnstileToken) throw new Error(HUMAN_VERIFICATION_ERROR_MESSAGE)
      return createContentReport({ data: { target, reason, details, turnstileToken } })
    },
    onSuccess: () => {
      setOpen(false)
      setReason("spam")
      setDetails("")
      toast.success("Report sent. Thank you for flagging it.")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The report could not be sent.")
    },
    onSettled: () => {
      turnstile.current?.reset()
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
        <CredenzaBody className="flex flex-col gap-4">
          <FieldGroup>
            <FieldSet>
              <FieldLegend id={`report-reason-${target.type}-${target.id}`} variant="label">
                Reason
              </FieldLegend>
              <RadioGroup
                value={reason}
                onValueChange={(value) => {
                  if (isContentReportReason(value)) setReason(value)
                }}
                aria-labelledby={`report-reason-${target.type}-${target.id}`}
              >
                {contentReportReasons.map((option) => {
                  const optionId = `report-reason-${target.type}-${target.id}-${option.value}`
                  return (
                    <Field key={option.value} orientation="horizontal">
                      <RadioGroupItem id={optionId} value={option.value} />
                      <FieldLabel htmlFor={optionId} className="font-normal">
                        {option.label}
                      </FieldLabel>
                    </Field>
                  )
                })}
              </RadioGroup>
            </FieldSet>
            <Field>
              <FieldLabel htmlFor={`report-details-${target.type}-${target.id}`}>
                Details
              </FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  id={`report-details-${target.type}-${target.id}`}
                  name="details"
                  value={details}
                  maxLength={MAX_REPORT_DETAILS_LENGTH}
                  rows={4}
                  placeholder="Add context that will help a moderator…"
                  className="resize-y"
                  onChange={(event) => setDetails(event.currentTarget.value)}
                />
                <InputGroupAddon align="block-end" className="justify-end border-t">
                  <InputGroupText className="text-xs tabular-nums">
                    {details.length.toLocaleString()} / {MAX_REPORT_DETAILS_LENGTH.toLocaleString()}
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Optional. Do not include passwords or private data.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {runtimeConfig.isError ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Verification unavailable</AlertTitle>
              <AlertDescription>Close this window and try again.</AlertDescription>
            </Alert>
          ) : null}
          {runtimeConfig.data ? (
            <TurnstileChallenge
              ref={turnstile}
              action={TURNSTILE_ACTIONS.createReport}
              siteKey={runtimeConfig.data.turnstileSiteKey}
            />
          ) : null}
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose disabled={mutation.isPending} render={<Button variant="outline" />}>
            Cancel
          </CredenzaClose>
          <Button
            disabled={mutation.isPending || !runtimeConfig.data}
            onClick={(event) => {
              event.preventDefault()
              mutation.mutate()
            }}
          >
            {mutation.isPending || runtimeConfig.isPending ? (
              <>
                <Spinner data-icon="inline-start" />
                {mutation.isPending ? "Sending…" : "Preparing…"}
              </>
            ) : (
              "Send report"
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
