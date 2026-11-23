import { Link } from "@tanstack/react-router"
import { useState, type MouseEventHandler } from "react"

import { createPostTextPreview } from "@/lib/post-text-preview"

export function PostTextPreview({
  postId,
  markdown,
  onOpen,
}: {
  readonly postId: string
  readonly markdown: string
  readonly onOpen?: MouseEventHandler<HTMLAnchorElement>
}) {
  const preview = createPostTextPreview(markdown)
  // The line clamp depends on the reader's screen width, so only the browser knows if it hid text.
  const [clamped, setClamped] = useState(false)

  function measureClamp(paragraph: HTMLParagraphElement) {
    const observer = new ResizeObserver(() => {
      setClamped(paragraph.scrollHeight > paragraph.clientHeight)
    })
    observer.observe(paragraph)
    return () => {
      observer.disconnect()
    }
  }

  // The title already opens the post. Offer a separate link only when the preview hides text.
  const showReadMore = !preview.text || preview.shortened || clamped

  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      {preview.text ? (
        <p
          ref={measureClamp}
          dir="auto"
          className="line-clamp-8 min-w-0 text-base/relaxed wrap-anywhere whitespace-pre-line"
        >
          {preview.text}
        </p>
      ) : null}
      {showReadMore ? (
        <Link
          to="/post/$postId"
          params={{ postId }}
          onClick={onOpen}
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Read full post
        </Link>
      ) : null}
    </div>
  )
}
