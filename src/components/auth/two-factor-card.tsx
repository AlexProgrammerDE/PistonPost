"use client"

import { TriangleAlert } from "lucide-react"
import { type FormEvent, useState } from "react"

import { authClient } from "@/auth/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type SetupState =
  | { readonly status: "idle" }
  | {
      readonly status: "verify"
      readonly totpURI: string
      readonly backupCodes: ReadonlyArray<string>
    }

export function TwoFactorCard({ className }: { readonly className?: string }) {
  const session = authClient.useSession()
  const [setup, setSetup] = useState<SetupState>({ status: "idle" })
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)
  const enabled = session.data?.user.twoFactorEnabled === true

  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setIsPending(true)
    const passwordEntry = new FormData(event.currentTarget).get("password")
    const password = typeof passwordEntry === "string" ? passwordEntry : ""
    const result = await authClient.twoFactor.enable({ password })
    setIsPending(false)

    if (result.error || !result.data?.totpURI) {
      setError("Two-factor setup could not be started. Check your password and try again.")
      return
    }

    setSetup({
      status: "verify",
      totpURI: result.data.totpURI,
      backupCodes: result.data.backupCodes,
    })
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setIsPending(true)
    const codeEntry = new FormData(event.currentTarget).get("code")
    const code = typeof codeEntry === "string" ? codeEntry.trim() : ""
    const result = await authClient.twoFactor.verifyTotp({ code })
    setIsPending(false)

    if (result.error) {
      setError("That verification code was not accepted.")
      return
    }

    setSetup({ status: "idle" })
    await session.refetch()
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setIsPending(true)
    const passwordEntry = new FormData(event.currentTarget).get("password")
    const password = typeof passwordEntry === "string" ? passwordEntry : ""
    const result = await authClient.twoFactor.disable({ password })
    setIsPending(false)

    if (result.error) {
      setError("Two-factor authentication could not be disabled. Check your password.")
      return
    }

    await session.refetch()
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          Require a rotating authenticator code after your password.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>Authenticator app</CardTitle>
            <CardDescription>
              Keep the recovery codes somewhere safe. Each code works once.
            </CardDescription>
          </div>
          <Badge variant={enabled ? "secondary" : "outline"} className="shrink-0">
            {enabled ? "Enabled" : "Not enabled"}
          </Badge>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-5">
              <TriangleAlert />
              <AlertTitle>Security change failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {setup.status === "verify" ? (
            <form onSubmit={verify}>
              <FieldGroup>
                <Field>
                  <Label htmlFor="totp-uri">Authenticator setup URI</Label>
                  <Input id="totp-uri" value={setup.totpURI} readOnly />
                  <FieldDescription>
                    Paste this URI into your authenticator app, then enter its six-digit code.
                  </FieldDescription>
                </Field>
                <Field>
                  <Label htmlFor="totp-code">Verification code</Label>
                  <Input
                    id="totp-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    disabled={isPending}
                  />
                  <FieldError>{error}</FieldError>
                </Field>
                <div className="rounded-md border bg-muted/40 p-4">
                  <p className="mb-3 text-sm font-medium">Recovery codes</p>
                  <div className="grid gap-2 font-mono text-xs sm:grid-cols-2">
                    {setup.backupCodes.map((backupCode) => (
                      <code key={backupCode}>{backupCode}</code>
                    ))}
                  </div>
                </div>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Spinner />}
                  Verify and enable
                </Button>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={enabled ? disable : enable}>
              <FieldGroup>
                <Field>
                  <Label htmlFor="two-factor-password">Current password</Label>
                  <Input
                    id="two-factor-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={isPending}
                  />
                  <FieldDescription>
                    Re-enter your password to confirm this security change.
                  </FieldDescription>
                </Field>
                <Button
                  type="submit"
                  variant={enabled ? "destructive" : "default"}
                  disabled={isPending}
                >
                  {isPending && <Spinner />}
                  {enabled
                    ? "Disable two-factor authentication"
                    : "Set up two-factor authentication"}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
