"use client"

import { useAuthPlugin } from "@better-auth-ui/react"
import { ShieldCheck } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { oauthProviderPlugin } from "@/lib/auth/oauth-provider-plugin"

export function AuthorizedApplicationsEmpty() {
  const { localization } = useAuthPlugin(oauthProviderPlugin)

  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="flex flex-col items-center justify-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-muted">
          <ShieldCheck className="size-4.5" />
        </div>

        <div className="flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-semibold">{localization.noConnectedApplications}</p>

          <p className="text-xs text-muted-foreground">
            {localization.connectedApplicationsDescription}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
