"use client"

import type { AuthView } from "@better-auth-ui/core"
import { useAuth } from "@better-auth-ui/react"

import { UserRoundCog } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
