"use client"

import { Button } from "@pistonpost/ui/components/button"
import { toast } from "sonner"

import { Copy, Link2 } from "@/components/icons"
import { createPostShareLinks } from "@/lib/post-share-links"

async function copyToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(successMessage)
  } catch {
    toast.error("The link could not be copied.")
  }
}

export function PostShareActions({
  postId,
  imageCount,
}: {
  readonly postId: string
  readonly imageCount: number
}) {
  function shareLinks() {
    return createPostShareLinks(postId, imageCount, window.location.origin)
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share post">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void copyToClipboard(shareLinks().postUrl, "Post link copied.")
        }}
      >
        <Link2 />
        Copy link
      </Button>
      {imageCount > 1 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void copyToClipboard(
              shareLinks().imageUrls.join("\n"),
              "Image links copied. Paste them together to show several previews.",
            )
          }}
        >
          <Copy />
          Copy image links
        </Button>
      ) : null}
    </div>
  )
}
