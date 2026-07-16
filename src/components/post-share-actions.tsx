"use client"

import { Copy, Link2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
        <Link2 aria-hidden="true" data-icon="inline-start" />
        Share
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => void copyToClipboard(shareLinks().postUrl, "Post link copied.")}
          >
            <Link2 aria-hidden="true" />
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
              <Copy aria-hidden="true" />
              Copy image links
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
