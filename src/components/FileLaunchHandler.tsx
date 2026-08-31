import { useNavigate } from "@tanstack/react-router"
import { useEffect, useEffectEvent } from "react"
import { toast } from "sonner"

import { stageSharedContent } from "@/lib/pwa/local-store"
import { MAX_SHARED_FILES, sharedContentSchema } from "@/lib/pwa/share-intake"

type FileLaunchQueue = {
  setConsumer: (consumer: (params: { files: FileSystemFileHandle[] }) => void) => void
}

function supportsFileLaunches(value: Window): value is Window & { launchQueue: FileLaunchQueue } {
  return (
    "launchQueue" in value &&
    typeof value.launchQueue === "object" &&
    value.launchQueue !== null &&
    "setConsumer" in value.launchQueue &&
    typeof value.launchQueue.setConsumer === "function"
  )
}

export function FileLaunchHandler() {
  const navigate = useNavigate()
  const receive = useEffectEvent(async (handles: FileSystemFileHandle[]) => {
    if (handles.length === 0) return
    try {
      if (handles.length > MAX_SHARED_FILES)
        throw new Error("Open no more than 20 images at a time.")
      const files = await Promise.all(handles.map((handle) => handle.getFile()))
      const content = sharedContentSchema.parse({ files })
      const shareId = await stageSharedContent(content)
      await navigate({ to: "/posts/new", search: { shareId } })
    } catch {
      toast.error(
        "These files could not be opened. Choose up to 20 supported images, no more than 50 MB in total.",
      )
    }
  })

  useEffect(() => {
    if (!supportsFileLaunches(window)) return undefined
    window.launchQueue.setConsumer((params) => void receive(params.files))
    return () => {
      if (supportsFileLaunches(window)) window.launchQueue.setConsumer(() => undefined)
    }
  }, [])
  return null
}
