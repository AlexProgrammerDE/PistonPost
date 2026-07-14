"use client"

import { useAuthPlugin } from "@better-auth-ui/react"
import { Button } from "@pistonpost/ui/components/button"
import { Card, CardContent } from "@pistonpost/ui/components/card"

import { Fingerprint } from "@/components/icons"
import { passkeyPlugin } from "@/lib/auth/passkey-plugin"

export type PasskeysEmptyProps = {
  onAddPress: () => void
}

export function PasskeysEmpty({ onAddPress }: PasskeysEmptyProps) {
  const { localization: passkeyLocalization } = useAuthPlugin(passkeyPlugin)

  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="flex flex-col items-center justify-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-muted">
          <Fingerprint className="size-4.5" />
        </div>

        <div className="flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-semibold">{passkeyLocalization.noPasskeys}</p>

          <p className="text-xs text-muted-foreground">{passkeyLocalization.passkeysDescription}</p>
        </div>

        <Button size="sm" onClick={onAddPress}>
          {passkeyLocalization.addPasskey}
        </Button>
      </CardContent>
    </Card>
  )
}
