import { useAuth } from "@better-auth-ui/react"
import { cn } from "@pistonpost/ui/lib/utils"
import type { ComponentProps } from "react"

import { ChangeEmail } from "./change-email"

export type AccountSettingsProps = {
  className?: string
}

/**
 * Renders the account settings layout.
 *
 * Email is kept separate from the public profile so each identity field has
 * one owner in the settings interface.
 */
export function AccountSettings({
  className,
  ...props
}: AccountSettingsProps & ComponentProps<"div">) {
  const { emailAndPassword, plugins } = useAuth()

  const hasMagicLink = plugins.some((plugin) => plugin.id === "magicLink")

  return (
    <div className={cn("flex w-full flex-col gap-4 md:gap-6", className)} {...props}>
      {(emailAndPassword?.enabled || hasMagicLink) && <ChangeEmail />}
    </div>
  )
}
