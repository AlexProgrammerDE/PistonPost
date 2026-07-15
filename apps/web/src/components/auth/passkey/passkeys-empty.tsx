"use client"

import { useAuthPlugin } from "@better-auth-ui/react"
import { Button } from "@pistonpost/ui/components/button"

import { passkeyPlugin } from "@/lib/auth/passkey-plugin"

export type PasskeysEmptyProps = {
  onAddPress: () => void
}

export function PasskeysEmpty({ onAddPress }: PasskeysEmptyProps) {
  const { localization: passkeyLocalization } = useAuthPlugin(passkeyPlugin)

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6">
      <div className="flex flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-semibold">{passkeyLocalization.noPasskeys}</p>

        <p className="text-xs text-muted-foreground">{passkeyLocalization.passkeysDescription}</p>
      </div>

      <Button size="sm" onClick={onAddPress}>
        {passkeyLocalization.addPasskey}
      </Button>
    </div>
  )
}
