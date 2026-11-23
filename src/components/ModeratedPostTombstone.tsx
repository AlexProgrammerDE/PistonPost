import { Link } from "@tanstack/react-router"
import { EyeOff, ShieldCheck } from "lucide-react"

import { ButtonLink } from "@/components/ButtonLink"
import { DateTime } from "@/components/DateTime"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { ModeratedPostTombstone as Tombstone } from "@/server/post-tombstone"

const postTypeLabels = {
  text: "Text post",
  images: "Image post",
  video: "Video post",
} as const

/**
 * Stands in for a post that an administrator hid. Only the owner and administrators get here.
 * Everyone else sees the not-found page.
 */
export function ModeratedPostTombstone({ tombstone }: { readonly tombstone: Tombstone }) {
  const ownPost = tombstone.viewer === "owner"
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <EyeOff aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          <h1>This post is hidden</h1>
        </EmptyTitle>
        <EmptyDescription>
          {ownPost
            ? "An administrator hid your post. Other people see a missing page. Only you and administrators can see this notice."
            : `An administrator hid this post by @${tombstone.author.username}. Other people see a missing page.`}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md items-stretch text-left">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Post</dt>
          <dd className="min-w-0 font-medium wrap-break-word">{tombstone.title}</dd>
          <dt className="text-muted-foreground">Type</dt>
          <dd>{postTypeLabels[tombstone.type]}</dd>
          {tombstone.hiddenAt && (
            <>
              <dt className="text-muted-foreground">Hidden</dt>
              <dd>
                <DateTime value={tombstone.hiddenAt} />
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Reason</dt>
          <dd className="min-w-0 wrap-break-word whitespace-pre-wrap">
            {tombstone.moderationReason ?? "No reason was recorded."}
          </dd>
        </dl>
        {tombstone.viewer === "admin" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              To show it again, find the post in the admin posts table and choose Restore.
            </p>
            <ButtonLink
              variant="outline"
              render={
                <Link
                  to="/admin/$section"
                  params={{ section: "posts" }}
                  search={{ q: tombstone.title }}
                />
              }
            >
              <ShieldCheck aria-hidden="true" data-icon="inline-start" />
              Open in admin posts
            </ButtonLink>
          </div>
        )}
      </EmptyContent>
    </Empty>
  )
}
