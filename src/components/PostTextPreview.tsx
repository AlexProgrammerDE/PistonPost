import { Link } from "@tanstack/react-router"

import { createPostTextPreview } from "@/lib/post-text-preview"

export function PostTextPreview({
  postId,
  markdown,
}: {
  readonly postId: string
  readonly markdown: string
}) {
  const { text } = createPostTextPreview(markdown)

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      {text ? (
        <p dir="auto" className="line-clamp-8 min-w-0 text-base leading-relaxed wrap-anywhere">
          {text}
        </p>
      ) : null}
      <Link
        to="/post/$postId"
        params={{ postId }}
        className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        Read full post
      </Link>
    </div>
  )
}
