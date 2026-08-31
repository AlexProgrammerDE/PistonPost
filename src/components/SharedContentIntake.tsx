import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { readSharedContent, removeSharedContent } from "@/lib/pwa/local-store"
import type { PendingShare, SharedContent } from "@/lib/pwa/share-intake"

export function SharedContentIntake({
  shareId,
  userId,
  onImport,
}: {
  shareId: string
  userId: string
  onImport: (content: SharedContent) => Promise<void>
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "ready"; share: PendingShare }
    | { status: "done" }
  >({ status: "loading" })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    void readSharedContent(shareId, userId)
      .then((share) => {
        if (!cancelled) setState(share ? { status: "ready", share } : { status: "missing" })
      })
      .catch(() => {
        if (!cancelled) setState({ status: "missing" })
      })
    return () => {
      cancelled = true
    }
  }, [shareId, userId])

  async function accept() {
    if (state.status !== "ready") return
    setBusy(true)
    try {
      await onImport(state.share.content)
      await removeSharedContent(shareId)
      setState({ status: "done" })
    } catch {
      toast.error("The shared content could not be added. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    setBusy(true)
    try {
      await removeSharedContent(shareId)
      setState({ status: "done" })
    } catch {
      toast.error("The shared content could not be discarded. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (state.status === "done") return null
  return (
    <Alert>
      <AlertTitle>
        {state.status === "loading"
          ? "Checking shared content"
          : state.status === "missing"
            ? "This share is no longer available"
            : "Add your shared content?"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        {state.status === "missing" ? (
          <p>
            Shares expire after one hour and can belong to another account. Share again to continue.
          </p>
        ) : state.status === "ready" ? (
          <>
            <p>
              {state.share.content.files.length > 0
                ? `${state.share.content.files.length} shared images. `
                : "Shared text or link. "}
              Adding this replaces the current composer contents. Nothing is posted until you choose
              Post it.
            </p>
            {state.share.content.files.length > 0 &&
              (state.share.content.text || state.share.content.url) && (
                <p>Image posts use a title, so accompanying text and links will not be included.</p>
              )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void accept()}>
                Add to post
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void discard()}
              >
                Discard share
              </Button>
            </div>
          </>
        ) : (
          <p>Your post form is ready below.</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
