import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { Button } from "@pistonpost/ui/components/button"
import { useState } from "react"

import { Fingerprint, X } from "@/components/icons"
import { passkeyPlugin } from "@/lib/auth/passkey-plugin"

import { DeletePasskeyDialog, type ListedPasskey } from "./delete-passkey-dialog"

export type PasskeyProps = {
  passkey: ListedPasskey
}

export function Passkey({ passkey }: PasskeyProps) {
  const { localization } = useAuth()
  const { localization: passkeyLocalization } = useAuthPlugin(passkeyPlugin)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const passkeyName = passkey.name || passkeyLocalization.passkey

  return (
    <div className="flex items-center gap-3 p-4 sm:p-6">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
        <Fingerprint className="size-4.5" />
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm leading-tight font-medium">{passkeyName}</span>

        <span className="text-xs text-muted-foreground">
          {new Date(passkey.createdAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </div>

      <Button
        className="ml-auto shrink-0"
        variant="outline"
        size="sm"
        onClick={() => setDeleteOpen(true)}
        aria-label={passkeyLocalization.deletePasskey.replace("{{name}}", passkeyName)}
      >
        <X />

        {localization.settings.delete}
      </Button>

      <DeletePasskeyDialog open={deleteOpen} onOpenChange={setDeleteOpen} passkey={passkey} />
    </div>
  )
}
