"use client"

import { useAuth, useFetchOptions } from "@better-auth-ui/react"
import { type FormEvent, useState } from "react"

import { authClient } from "@/auth/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type UsernameSignInProps = {
  className?: string
}

export function UsernameSignIn({ className }: UsernameSignInProps) {
  const { navigate, plugins, redirectTo } = useAuth()
  const { fetchOptions, resetFetchOptions } = useFetchOptions()
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)
  const Captcha = plugins.find((plugin) => plugin.captchaComponent)?.captchaComponent

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setIsPending(true)

    const form = new FormData(event.currentTarget)
    const usernameEntry = form.get("username")
    const passwordEntry = form.get("password")
    const username = typeof usernameEntry === "string" ? usernameEntry.trim() : ""
    const password = typeof passwordEntry === "string" ? passwordEntry : ""

    const result = await authClient.signIn.username({
      username,
      password,
      fetchOptions,
    })

    setIsPending(false)
    if (result.error) {
      setError("That username and password combination was not accepted.")
      resetFetchOptions()
      return
    }

    navigate({ to: redirectTo })
  }

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-xl font-semibold">
          Sign in with your username
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="garage-name"
                minLength={1}
                maxLength={32}
                required
                disabled={isPending}
              />
            </Field>
            <Field>
              <Label htmlFor="username-password">Password</Label>
              <Input
                id="username-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={isPending}
              />
            </Field>
            {Captcha && <div className="flex justify-center">{Captcha}</div>}
            <Field data-invalid={Boolean(error)}>
              <FieldError>{error}</FieldError>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner />}
                Sign in
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
