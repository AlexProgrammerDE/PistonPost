"use client"

import type { AuthView } from "@better-auth-ui/core"
import { useAuth } from "@better-auth-ui/react"
import { buttonVariants } from "@pistonpost/ui/components/button"
import { cn } from "@pistonpost/ui/lib/utils"

import { UserRoundCog } from "@/components/icons"

export function UsernameButton({ view }: { readonly view?: AuthView }) {
  const { basePaths, Link, localization, viewPaths } = useAuth()
  const isUsernameView = String(view) === "username"

  return (
    <Link
      href={`${basePaths.auth}/${isUsernameView ? viewPaths.auth.signIn : "username"}`}
      className={cn(buttonVariants({ variant: "outline" }), "w-full")}
    >
      <UserRoundCog data-icon="inline-start" />
      {isUsernameView
        ? localization.auth.continueWith.replace("{{provider}}", localization.auth.email)
        : "Continue with username"}
    </Link>
  )
}
