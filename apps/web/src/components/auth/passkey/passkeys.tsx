"use client"

import {
  type PasskeyAuthClient,
  useAuth,
  useAuthPlugin,
  useListPasskeys,
} from "@better-auth-ui/react"
import { Button } from "@pistonpost/ui/components/button"
import { Card, CardContent } from "@pistonpost/ui/components/card"
import { Separator } from "@pistonpost/ui/components/separator"
import { cn } from "@pistonpost/ui/lib/utils"
import { useState } from "react"

import { passkeyPlugin } from "@/lib/auth/passkey-plugin"

import { AddPasskeyDialog } from "./add-passkey-dialog"
import { Passkey } from "./passkey"
import { PasskeySkeleton } from "./passkey-skeleton"
import { PasskeysEmpty } from "./passkeys-empty"

export type PasskeysProps = {
  className?: string
}

export function Passkeys({ className }: PasskeysProps) {
  const { authClient } = useAuth()
  const { localization: passkeyLocalization } = useAuthPlugin(passkeyPlugin)

  const { data: passkeys, isPending } = useListPasskeys(authClient as PasskeyAuthClient)

  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="truncate text-sm font-semibold">{passkeyLocalization.passkeys}</h2>

        {!isPending && passkeys?.length ? (
          <Button className="shrink-0" size="sm" onClick={() => setAddOpen(true)}>
            {passkeyLocalization.addPasskey}
          </Button>
        ) : null}
      </div>

      <Card className="p-0">
        <CardContent className="p-0">
          {isPending ? (
            <PasskeySkeleton />
          ) : !passkeys?.length ? (
            <PasskeysEmpty onAddPress={() => setAddOpen(true)} />
          ) : (
            passkeys.map((passkey, index) => (
              <div key={passkey.id}>
                {index > 0 && <Separator />}

                <Passkey passkey={passkey} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AddPasskeyDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
