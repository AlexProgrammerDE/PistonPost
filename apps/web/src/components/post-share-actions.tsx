"use client"

import { Button } from "@pistonpost/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pistonpost/ui/components/dropdown-menu"
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
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Link2 data-icon="inline-start" />
        Share
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => void copyToClipboard(shareLinks().postUrl, "Post link copied.")}
          >
            <Link2 />
            Copy post link
          </DropdownMenuItem>
          {imageCount > 1 ? (
            <DropdownMenuItem
              onClick={() =>
                void copyToClipboard(
                  shareLinks().imageUrls.join("\n"),
                  "Image links copied. Paste them together to show several previews.",
                )
              }
            >
              <Copy />
              Copy image links
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
