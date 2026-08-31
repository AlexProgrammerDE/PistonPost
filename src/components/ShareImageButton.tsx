import { Share2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useNativeSharing } from "@/hooks/use-native-sharing"
import { prepareSharedImage, shareNatively } from "@/lib/pwa/native-share"

export function ShareImageButton({ src }: { src: string }) {
  const supported = useNativeSharing()
  const controller = useRef<AbortController | null>(null)
  const [state, setState] = useState<
    { status: "idle" } | { status: "preparing" } | { status: "ready"; file: File }
  >({ status: "idle" })
  useEffect(() => () => controller.current?.abort(), [])
  if (!supported) return null

  async function share() {
    if (state.status === "preparing") return
    try {
      if (state.status === "ready") {
        await shareNatively({ files: [state.file] })
      } else {
        setState({ status: "preparing" })
        const abort = new AbortController()
        controller.current = abort
        const file = await prepareSharedImage(src, abort.signal)
        if (!abort.signal.aborted) setState({ status: "ready", file })
      }
    } catch (error) {
      if (controller.current?.signal.aborted) return
      setState({ status: "idle" })
      toast.error(error instanceof Error ? error.message : "The image could not be shared.")
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="yarl__button"
      disabled={state.status === "preparing"}
      onClick={() => void share()}
    >
      <Share2 aria-hidden="true" data-icon="inline-start" />
      {state.status === "ready"
        ? "Share image"
        : state.status === "preparing"
          ? "Preparing image"
          : "Prepare image to share"}
    </Button>
  )
}
