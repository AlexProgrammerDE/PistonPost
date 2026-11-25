import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { removeSharedContent } from "@/lib/pwa/local-store"
import type { SharedContent } from "@/lib/pwa/share-intake"
import { sharedContentAtom } from "@/lib/pwa/shared-content-atom"

export function SharedContentIntake({
  shareId,
  userId,
  onImport,
}: {
  shareId: string
  userId: string
  onImport: (content: SharedContent) => Promise<void>
}) {
  const result = useAtomValue(sharedContentAtom({ shareId, userId }))
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const share = AsyncResult.isSuccess(result) ? result.value : null

  async function accept() {
    if (!share) return
    setBusy(true)
    try {
      await onImport(share.content)
      await removeSharedContent(shareId)
      setDone(true)
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
      setDone(true)
    } catch {
      toast.error("The shared content could not be discarded. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (done) return null
  const loading = AsyncResult.isInitial(result)
  return (
    <Alert>
      <AlertTitle>
        {loading
          ? "Checking shared content"
          : !share
            ? "This share is no longer available"
            : "Add your shared content?"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        {loading ? (
          <p>Loading what you shared…</p>
        ) : !share ? (
          <p>
            Shares expire after one hour and can belong to another account. Share again to continue.
          </p>
        ) : (
          <>
            <p>
              {share.content.files.length === 1
                ? "1 shared image. "
                : share.content.files.length > 1
                  ? `${share.content.files.length} shared images. `
                  : "Shared text or link. "}
              Adding this replaces the current composer contents. Nothing is posted until you choose
              Post it.
            </p>
            {share.content.files.length > 0 && (share.content.text || share.content.url) && (
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
        )}
      </AlertDescription>
    </Alert>
  )
}
