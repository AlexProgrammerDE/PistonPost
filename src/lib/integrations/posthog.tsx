import type { posthog } from "posthog-js/dist/module.slim"
import { useEffect, useState, type ReactNode } from "react"

import { PostHogContext, postHogReady } from "@/lib/integrations/posthog-client"

export function PostHogProvider({ children }: { readonly children: ReactNode }) {
  const [client, setClient] = useState<typeof posthog | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      const readyClient = await postHogReady
      if (!controller.signal.aborted) setClient(readyClient)
    })()

    return () => {
      controller.abort()
    }
  }, [])

  // Keep the provider mounted while the client loads. Swapping it in later would change the element
  // above every route, so React would remount the whole app after hydration.
  return <PostHogContext value={client}>{children}</PostHogContext>
}
