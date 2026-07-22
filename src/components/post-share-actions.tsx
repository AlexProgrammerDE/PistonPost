"use client"

import { Check, Copy, Link2 } from "lucide-react"
import { type ComponentProps, useEffect, useState } from "react"
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

const COPY_CONFIRMATION_DURATION_MS = 2_000

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    toast.error("The link could not be copied.")
    return false
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
          <DropdownMenuItem onClick={() => void copyToClipboard(shareLinks().postUrl)}>
            <Link2 aria-hidden="true" />
            Copy post link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyToClipboard(shareLinks().imageUrls.join("\n"))}>
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
  const [copyConfirmationVersion, setCopyConfirmationVersion] = useState(0)
  const copied = copyConfirmationVersion > 0

  useEffect(() => {
    if (copyConfirmationVersion === 0) return undefined

    const timeout = window.setTimeout(
      () => setCopyConfirmationVersion(0),
      COPY_CONFIRMATION_DURATION_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [copyConfirmationVersion])

  async function copyPostLink() {
    const postUrl = createPostShareLinks(postId, 0, window.location.origin).postUrl
    if (await copyToClipboard(postUrl)) {
      setCopyConfirmationVersion((version) => version + 1)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={cn("rounded-md", className)}
        data-copied={copied ? "true" : undefined}
        onClick={() => void copyPostLink()}
      >
        {copied ? (
          <Check aria-hidden="true" data-icon="inline-start" />
        ) : (
          <Link2 aria-hidden="true" data-icon="inline-start" />
        )}
        <span className={cn(compactOnNarrowScreens ? "max-[359px]:sr-only" : undefined)}>
          Copy link
        </span>
      </Button>
      {copied ? (
        <span className="sr-only" role="status">
          Link copied.
        </span>
      ) : null}
    </>
  )
}
