"use client"

import { Copy, Link2 } from "lucide-react"
import type { ComponentProps } from "react"
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
import { cn } from "@/lib/utils"

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
  variant = "outline",
}: {
  readonly postId: string
  readonly imageCount: number
  readonly variant?: ComponentProps<typeof Button>["variant"]
}) {
  if (imageCount <= 1) {
    return <CopyPostLinkButton postId={postId} variant={variant} />
  }

  function shareLinks() {
    return createPostShareLinks(postId, imageCount, window.location.origin)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant={variant} size="sm" />}>
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CopyPostLinkButton({
  postId,
  className,
  compactOnNarrowScreens = false,
  variant = "ghost",
}: {
  readonly postId: string
  readonly className?: string
  readonly compactOnNarrowScreens?: boolean
  readonly variant?: ComponentProps<typeof Button>["variant"]
}) {
  function copyPostLink() {
    const postUrl = createPostShareLinks(postId, 0, window.location.origin).postUrl
    void copyToClipboard(postUrl, "Post link copied.")
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn("rounded-md", className)}
      onClick={copyPostLink}
    >
      <Link2 aria-hidden="true" data-icon="inline-start" />
      <span className={cn(compactOnNarrowScreens ? "max-[359px]:sr-only" : undefined)}>
        Copy link
      </span>
    </Button>
  )
}
